export const runtime = 'edge';

class RequestCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
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
  constructor(allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], nextHandler = null) {
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
          'Content-Type': 'text/plain'
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
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path || !this.isValidPath(path)) {
      throw { status: 400, message: 'Invalid or missing "path" parameter' };
    }

    return super.handle(request);
  }

  isValidPath(path) {
    try {
      const url = new URL(path, this.apiUrl);
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
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const fullUrl = new URL(path, process.env.API_URL).toString();

    if (method === 'GET') {
      const cachedResponse = this.cache.get(`GET:${fullUrl}`);
      if (cachedResponse) {
        // Возвращаем кэшированный ответ с правильными заголовками
        return new Response(cachedResponse.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...cachedResponse.headers
          }
        });
      }
    }

    const response = await super.handle(request);

    // Кэшируем только JSON ответы
    if (method === 'GET' && response) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const data = await response.clone().json();
          this.cache.set(`GET:${fullUrl}`, {
            body: JSON.stringify(data),
            headers: Object.fromEntries(response.headers)
          });
        } catch (error) {
          // Не кэшируем если не удалось распарсить JSON
          console.warn('Failed to cache non-JSON response');
        }
      }
    }

    return response;
  }
}

// Добавьте новый класс-обработчик
class CorsHandler extends Handler {
  constructor(nextHandler = null) {
    super(nextHandler);
  }

  async handle(request) {
    // Обработка preflight запроса
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400', // Кэшировать preflight на 24 часа
        }
      });
    }

    const response = await super.handle(request);
    
    // Добавляем CORS заголовки к основному ответу
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    
    return modifiedResponse;
  }
}

class ApiFetchHandler extends Handler {
  async handle(request) {
    const { method } = request;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const fullUrl = new URL(path, process.env.API_URL).toString();

    const headers = new Headers({
      'Authorization': `Bearer ${process.env.API_ACCESS_TOKEN}`,
      'Accept': 'application/json',
    });

    const options = { method, headers };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const body = await request.json();
      options.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw { status: apiResponse.status, message: errorText };
    }

    // Определяем тип контента
    const contentType = apiResponse.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // Если ответ не JSON, возвращаем как есть
    if (!isJson) {
      return apiResponse;
    }

    // Для JSON ответа парсим и возвращаем
    try {
      const data = await apiResponse.json();
      return new Response(JSON.stringify(data), {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(apiResponse.headers)
        }
      });
    } catch (error) {
      throw { 
        status: 500, 
        message: 'Failed to parse JSON response from API' 
      };
    }
  }
}

class LoggingHandler extends Handler {
  constructor(logger, nextHandler = null) {
    super(nextHandler);
    this.logger = logger;
  }

  async handle(request) {
    const { method } = request;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const fullUrl = path ? new URL(path, process.env.API_URL).toString() : '';

    try {
      const response = await super.handle(request);
      this.logger.log(method, fullUrl, 200);
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
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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