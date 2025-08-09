export const runtime = 'edge';

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 запросов в минуту
});

class RateLimitHandler extends Handler {
  async handle(request) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { success } = await ratelimit.limit(ip);

    if (!success) {
      throw { status: 429, message: 'Rate limit exceeded' };
    }

    return super.handle(request);
  }
}

class RequestCache {
  async get(key) {
    return await kv.get(key);
  }

  async set(key, value, ttl = 60 * 5) { // TTL 5 минут
    await kv.setex(key, ttl, value);
  }
}

class RequestLogger {
  log(method, path, status, error = null) {
    console.log(
      `[${new Date().toISOString()}] ${method} ${path} -> ${status}`,
      error ? `\nERROR: ${error.message}` : ''
    );
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
  async handle(request) {
    const { method } = request;
    const fullUrl = new URL(path, process.env.API_URL).toString();

    if (method === 'GET') {
      const cachedResponse = await this.cache.get(`GET:${fullUrl}`);
      if (cachedResponse) {
        return new Response(JSON.stringify(cachedResponse), { status: 200 });
      }
    }

    const response = await super.handle(request);

    if (method === 'GET' && response) {
      const data = await response.json();
      await this.cache.set(`GET:${fullUrl}`, data); // Сохраняем в Redis
      return new Response(JSON.stringify(data), { status: 200 });
    }

    return response;
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
    this.handler = new LoggingHandler(
      logger,
      new RateLimitHandler(
        new ValidationHandler(
          process.env.API_URL,
          new CacheHandler(
            cache,
            new ApiFetchHandler()
          )
        )
      )
    )
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