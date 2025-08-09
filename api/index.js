export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const MAX_BODY_SIZE = 1024 * 1024 * 5;

function getFullUrl(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  return path ? new URL(path, process.env.API_URL).toString() : null;
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
        }
      });
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
      throw { 
        status: 400, 
        message: 'Invalid or missing "path" parameter'
      };
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
      const cachedResponse = this.cache.get(`GET:${fullUrl}`);
      if (cachedResponse) {
        return new Response(JSON.stringify(cachedResponse), { 
          status: 200
        });
      }
    }

    const response = await super.handle(request);

    if (method === 'GET' && response && fullUrl) {
      const data = await response.json();
      this.cache.set(`GET:${fullUrl}`, data);
      return new Response(JSON.stringify(data), { 
        status: 200
      });
    }

    return response;
  }
}

class CorsHandler extends Handler {
  constructor(nextHandler = null) {
    super(nextHandler);
  }

  async handle(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', ')
        } 
      });
    }

    try {
      const response = await super.handle(request);
      const modifiedResponse = new Response(response.body, response);
      
      Object.entries({
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', ')
      }).forEach(([key, value]) => {
        if (!modifiedResponse.headers.has(key)) {
          modifiedResponse.headers.set(key, value);
        }
      });
      
      return modifiedResponse;
    } catch (error) {
      const response = new Response(error.message, { 
        status: error.status || 500
      });
      
      Object.entries({
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', ')
      }).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      throw response;
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

    const options = { method, headers };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.json();
        options.body = JSON.stringify(body);
        headers.set('Content-Type', 'application/json');
      } catch (e) {
        throw { 
          status: 400, 
          message: 'Invalid JSON body'
        };
      }
    }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw { 
        status: apiResponse.status, 
        message: errorText
      };
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

class BodySizeHandler extends Handler {
  constructor(nextHandler = null) {
    super(nextHandler);
  }

  async handle(request) {
    // Проверяем только для методов, которые могут иметь тело запроса
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      // 1. Проверка по заголовку Content-Length (если есть)
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
        return new Response(`Payload too large, max ${MAX_BODY_SIZE} bytes allowed`, {
          status: 413,
          headers: {
            'Content-Type': 'text/plain',
            ...CORS_HEADERS
          }
        });
      }

      // 2. Проверка фактического тела запроса (если нет Content-Length)
      try {
        // Клонируем запрос, чтобы не потреблять его тело
        const clonedRequest = request.clone();
        const body = await clonedRequest.text();
        
        if (body.length > MAX_BODY_SIZE) {
          return new Response(`Payload too large, max ${MAX_BODY_SIZE} bytes allowed`, {
            status: 413,
            headers: {
              'Content-Type': 'text/plain',
              ...CORS_HEADERS
            }
          });
        }
      } catch (e) {
        console.error('Error checking body size:', e);
        // Продолжаем обработку, если не удалось проверить размер тела
      }
    }

    return super.handle(request);
  }
}

const apiHandler = new (class {
  constructor() {
    const cache = new RequestCache();
    const logger = new RequestLogger();
    this.handler = new MethodValidationHandler(
      ALLOWED_METHODS,
      new BodySizeHandler(
        new CorsHandler(
          new LoggingHandler(
            logger,
            new ValidationHandler(
              process.env.API_URL,
              new CacheHandler(
                cache,
                new ApiFetchHandler()
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