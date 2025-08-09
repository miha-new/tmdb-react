export const runtime = 'edge';

// Константы для повторного использования
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Утилитная функция для построения полного URL
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
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Клонируем response перед возвратом, так как тело можно прочитать только один раз
    return entry.clone();
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    // Сохраняем клонированный response
    this.cache.set(key, value.clone());
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
        message: 'Invalid or missing "path" parameter',
        headers: CORS_HEADERS
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
      const cacheKey = `GET:${fullUrl}`;
      const cachedResponse = this.cache.get(cacheKey);
      
      if (cachedResponse) {
        // Возвращаем кэшированный ответ как есть (уже в формате Response)
        return cachedResponse;
      }
    }

    const response = await super.handle(request);

    if (method === 'GET' && response && fullUrl) {
      // Клонируем response, так как тело можно прочитать только один раз
      const responseClone = response.clone();
      const cacheKey = `GET:${fullUrl}`;
      
      // Сохраняем клонированный response целиком
      this.cache.set(cacheKey, responseClone);
      
      // Возвращаем оригинальный response
      return response;
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
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const response = await super.handle(request);
      const modifiedResponse = new Response(response.body, response);
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        if (!modifiedResponse.headers.has(key)) {
          modifiedResponse.headers.set(key, value);
        }
      });
      return modifiedResponse;
    } catch (error) {
      const response = new Response(error.message, { 
        status: error.status || 500,
        headers: {
          ...(error.headers || {}),
          ...CORS_HEADERS
        }
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
          message: 'Invalid JSON body',
          headers: CORS_HEADERS
        };
      }
    }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw { 
        status: apiResponse.status, 
        message: errorText,
        headers: CORS_HEADERS
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

const apiHandler = new (class {
  constructor() {
    const cache = new RequestCache();
    const logger = new RequestLogger();
    this.handler = new MethodValidationHandler(
      ALLOWED_METHODS,
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