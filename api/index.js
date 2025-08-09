export const runtime = 'edge';

// Константы для повторного использования
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const MAX_BODY_SIZE = 1024 * 1024 * 5; // 5MB
const API_TIMEOUT = 10000; // 10 seconds

// Утилитная функция для построения полного URL
function getFullUrl(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  return path ? new URL(path, process.env.API_URL).toString() : null;
}

// Генерация ключа кэша с учетом заголовков
function generateCacheKey(request, fullUrl) {
  const headersKey = JSON.stringify({
    'accept': request.headers.get('accept'),
    'authorization': request.headers.get('authorization') ? 'present' : null
  });
  return `${request.method}:${fullUrl}:${headersKey}`;
}

class RequestCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }
}

class RequestLogger {
  log(method, path, status, error = null) {
    const message = `[${new Date().toISOString()}] ${method} ${path} -> ${status}`;
    
    if (error) {
      console.error(message, `\nERROR: ${error.message}`);
    } else {
      console.log(message);
    }
  }
}

class Handler {
  constructor(nextHandler = null) {
    this.next = nextHandler;
  }

  async handle(request) {
    if (this.next) {
      return this.next.handle(request);
    }
    return null;
  }
}

class MethodValidationHandler extends Handler {
  constructor(allowedMethods = ALLOWED_METHODS, nextHandler = null) {
    super(nextHandler);
    this.allowedMethods = allowedMethods;
  }

  async handle(request) {
    const { method } = request;
    
    if (!this.allowedMethods.includes(method)) {
      return new Response(`Method ${method} not allowed`, {
        status: 405,
        headers: {
          'Allow': this.allowedMethods.join(', '),
          'Content-Type': 'text/plain',
          ...CORS_HEADERS
        }
      });
    }

    return super.handle(request);
  }
}

class BodySizeHandler extends Handler {
  constructor(maxSize = MAX_BODY_SIZE, nextHandler = null) {
    super(nextHandler);
    this.maxSize = maxSize;
  }

  async handle(request) {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.maxSize) {
        return new Response(`Payload too large, max ${this.maxSize} bytes allowed`, {
          status: 413,
          headers: {
            'Content-Type': 'text/plain',
            ...CORS_HEADERS
          }
        });
      }
    }

    return super.handle(request);
  }
}

class ContentTypeHandler extends Handler {
  constructor(nextHandler = null) {
    super(nextHandler);
  }

  async handle(request) {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return new Response('Content-Type must be application/json', {
          status: 415,
          headers: {
            'Content-Type': 'text/plain',
            ...CORS_HEADERS
          }
        });
      }
    }

    return super.handle(request);
  }
}

class ValidationHandler extends Handler {
  constructor(apiUrl, nextHandler = null) {
    super(nextHandler);
    this.apiUrl = apiUrl;
  }

  async handle(request) {
    const path = getFullUrl(request);
    
    if (!path || !this.isValidPath(path)) {
      return new Response('Invalid or missing "path" parameter', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain',
          ...CORS_HEADERS
        }
      });
    }

    return super.handle(request);
  }

  isValidPath(path) {
    try {
      const url = new URL(path);
      return url.hostname === new URL(this.apiUrl).hostname;
    } catch {
      return false;
    }
  }
}

class CacheHandler extends Handler {
  constructor(cache, nextHandler = null) {
    super(nextHandler);
    this.cache = cache;
  }

  async handle(request) {
    const { method } = request;
    const fullUrl = getFullUrl(request);

    if (method === 'GET' && fullUrl) {
      const cacheKey = generateCacheKey(request, fullUrl);
      const cachedResponse = this.cache.get(cacheKey);
      if (cachedResponse) {
        return new Response(JSON.stringify(cachedResponse), { 
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            ...CORS_HEADERS
          }
        });
      }
    }

    const response = await super.handle(request);

    if (method === 'GET' && response && fullUrl) {
      const data = await response.json();
      const cacheKey = generateCacheKey(request, fullUrl);
      this.cache.set(cacheKey, data);
      return new Response(JSON.stringify(data), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          ...CORS_HEADERS
        }
      });
    }

    return response;
  }
}

class TimeoutHandler extends Handler {
  constructor(timeout = API_TIMEOUT, nextHandler = null) {
    super(nextHandler);
    this.timeout = timeout;
  }

  async handle(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Добавляем signal к запросу
      request.signal = controller.signal;
      const response = await super.handle(request);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return new Response('API request timeout', {
          status: 504,
          headers: {
            'Content-Type': 'text/plain',
            ...CORS_HEADERS
          }
        });
      }
      throw error;
    }
  }
}

class ApiFetchHandler extends Handler {
  async handle(request) {
    const { method } = request;
    const fullUrl = getFullUrl(request);

    const headers = new Headers({
      'Authorization': `Bearer ${process.env.API_ACCESS_TOKEN}`,
      'Accept': 'application/json',
    });

    const options = {
      method,
      headers,
      signal: request.signal // Передаем signal для таймаута
    };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.json();
        options.body = JSON.stringify(body);
        headers.set('Content-Type', 'application/json');
      } catch (e) {
        return new Response('Invalid JSON body', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain',
            ...CORS_HEADERS
          }
        });
      }
    }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return new Response(errorText, { 
        status: apiResponse.status,
        headers: {
          'Content-Type': apiResponse.headers.get('content-type') || 'text/plain',
          ...CORS_HEADERS
        }
      });
    }

    return apiResponse;
  }
}

class LoggingHandler extends Handler {
  constructor(logger, nextHandler = null) {
    super(nextHandler);
    this.logger = logger;
  }

  async handle(request) {
    const { method } = request;
    const fullUrl = getFullUrl(request);

    try {
      const response = await super.handle(request);
      this.logger.log(method, fullUrl, response.status);
      return response;
    } catch (error) {
      const status = error.status || 500;
      this.logger.log(method, fullUrl, status, error);
      throw error;
    }
  }
}

const apiHandler = new (class {
  constructor() {
    const cache = new RequestCache();
    const logger = new RequestLogger();
    this.handler = new MethodValidationHandler(
      ALLOWED_METHODS,
      new BodySizeHandler(
        MAX_BODY_SIZE,
        new ContentTypeHandler(

          new LoggingHandler(
            logger,
            new ValidationHandler(
              process.env.API_URL,
              new TimeoutHandler(
                API_TIMEOUT,
                new CacheHandler(
                  cache,
                  new ApiFetchHandler()
                )
              )
            )
          )
          
        )
      )
    );
  }

  async handle(request) {
    return this.handler.handle(request);
  }
})();

export const GET = (request) => apiHandler.handle(request);
export const POST = (request) => apiHandler.handle(request);
export const PUT = (request) => apiHandler.handle(request);
export const PATCH = (request) => apiHandler.handle(request);
export const DELETE = (request) => apiHandler.handle(request);
export const OPTIONS = (request) => apiHandler.handle(request);