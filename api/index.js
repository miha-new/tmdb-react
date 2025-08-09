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

class RequestContext {
  constructor(request) {
    this.request = request;
    const { searchParams } = new URL(request.url);
    this.path = searchParams.get('path');
    this.method = request.method;
    this.fullUrl = this.path ? new URL(this.path, process.env.API_URL).toString() : null;
  }
}

class ValidationHandler extends Handler {
  constructor(apiUrl, nextHandler = null) {
    super(nextHandler);
    this.apiUrl = apiUrl;
  }

  async handle(request) {
    const ctx = new RequestContext(request);
    
    if (!ctx.path || !this.isValidPath(ctx.path)) {
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
    const ctx = new RequestContext(request);

    if (ctx.method === 'GET') {
      const cachedResponse = this.cache.get(`GET:${ctx.fullUrl}`);
      if (cachedResponse) {
        // Возвращаем кэшированный ответ как есть
        return cachedResponse;
      }
    }

    const response = await super.handle(request);

    if (ctx.method === 'GET' && response) {
      // Клонируем response перед чтением
      const responseClone = response.clone();
      try {
        const data = await responseClone.json();
        // Кэшируем новый Response с теми же headers
        this.cache.set(`GET:${ctx.fullUrl}`, new Response(JSON.stringify(data), {
          status: response.status,
          headers: response.headers
        }));
      } catch (error) {
        console.warn('Failed to cache response:', error);
      }
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
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const response = await super.handle(request);
    
    // Добавляем CORS заголовки к оригинальному ответу
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    
    return new Response(response.body, {
      status: response.status,
      headers
    });
  }
}

class ApiFetchHandler extends Handler {
  async handle(request) {
    const ctx = new RequestContext(request);
    
    const headers = new Headers({
      'Authorization': `Bearer ${process.env.API_ACCESS_TOKEN}`,
      'Accept': 'application/json',
    });

    const options = { method: ctx.method, headers };

    if (['POST', 'PUT', 'PATCH'].includes(ctx.method)) {
      const body = await request.json();
      options.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }

    const apiResponse = await fetch(ctx.fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw { status: apiResponse.status, message: errorText };
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
    const ctx = new RequestContext(request);

    try {
      const response = await super.handle(request);
      this.logger.log(ctx.method, ctx.fullUrl, 200);
      return response;
    } catch (error) {
      const status = error.status || 500;
      this.logger.log(ctx.method, ctx.fullUrl, status, error);
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