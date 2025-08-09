export const runtime = 'edge';

class Handler {
  constructor(nextHandler = null) {
    this.next = nextHandler;
  }

  async handle(request) {
    if (this.next) {
      return this.next.handle(request);
    }
    return null; // Конец цепочки
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
        return new Response(JSON.stringify(cachedResponse), { status: 200 });
      }
    }

    const response = await super.handle(request);

    if (method === 'GET' && response) {
      const data = await response.json();
      this.cache.set(`GET:${fullUrl}`, data);
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

class ApiHandler {
  constructor() {
    const cache = new RequestCache();
    const logger = new RequestLogger();
    const validator = new ValidationHandler(process.env.API_URL);
    const apiFetcher = new ApiFetchHandler();
    const cacheHandler = new CacheHandler(cache, apiFetcher);
    const validationHandler = new ValidationHandler(process.env.API_URL, cacheHandler);
    this.handler = new LoggingHandler(logger, validationHandler);
  }

  async handle(request) {
    return this.handler.handle(request);
  }
}

const apiHandler = new ApiHandler();

export const GET = (request) => apiHandler.handle(request);
export const POST = (request) => apiHandler.handle(request);
export const PUT = (request) => apiHandler.handle(request);
export const PATCH = (request) => apiHandler.handle(request);
export const DELETE = (request) => apiHandler.handle(request);