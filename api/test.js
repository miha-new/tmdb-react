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

  clear() {
    this.cache.clear();
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

class RequestValidator {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
  }

  validate(path) {
    if (!path || !this.isValidPath(path)) {
      throw { status: 400, message: 'Invalid or missing "path" parameter' };
    }
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

class ApiHandler {
  constructor() {
    this.cache = new RequestCache();
    this.logger = new RequestLogger();
    this.validator = new RequestValidator(process.env.API_URL);
  }

  async handle(request) {
    const { method } = request;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    try {
      this.validator.validate(path);
      const fullUrl = new URL(path, process.env.API_URL).toString();

      if (method === 'GET') {
        const cachedResponse = this.cache.get(`GET:${fullUrl}`);
        if (cachedResponse) {
          this.logger.log(method, fullUrl, 200);
          return new Response(JSON.stringify(cachedResponse), { status: 200 });
        }
      }

      const apiResponse = await this.fetchApi(request, fullUrl);
      const data = await apiResponse.json();

      if (method === 'GET') {
        this.cache.set(`GET:${fullUrl}`, data);
      }

      this.logger.log(method, fullUrl, 200);
      return new Response(JSON.stringify(data), { status: 200 });

    } catch (error) {
      const status = error.status || 500;
      const fullUrl = path ? new URL(path, process.env.API_URL).toString() : '';
      this.logger.log(method, fullUrl, status, error);
      return new Response(JSON.stringify({ error: error.message }), { status });
    }
  }

  async fetchApi(request, fullUrl) {
    const { method } = request;
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

const apiHandler = new ApiHandler();

export const GET = (request) => apiHandler.handle(request);
export const POST = (request) => apiHandler.handle(request);
export const PUT = (request) => apiHandler.handle(request);
export const PATCH = (request) => apiHandler.handle(request);
export const DELETE = (request) => apiHandler.handle(request);
