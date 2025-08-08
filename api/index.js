export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];
const DEFAULT_CACHE_MAX_AGE = 3600;

class ApiProxy {
  constructor() {
    this.API_URL = process.env.API_URL;
    this.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
    this.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];
  }

  // Основной метод для обработки запроса
  async handleRequest(request) {
    const requestOrigin = request.headers.get('Origin');
    const commonHeaders = this.getCommonHeaders(requestOrigin);

    if (request.method === 'OPTIONS') {
      return this.handleOptionsRequest(commonHeaders);
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return this.errorResponse('Method not allowed', 405, commonHeaders);
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return this.errorResponse('Missing "path" parameter', 400, commonHeaders);
    }

    try {
      const apiResponse = await this.forwardRequest(path, commonHeaders);
      const data = await apiResponse.json();
      return new Response(JSON.stringify(data), { headers: commonHeaders });
    } catch (error) {
      console.error('API failure:', error);
      return this.errorResponse(error.message, 500, {
        ...commonHeaders,
        'Request-Origin': this.ALLOWED_ORIGINS[0] || '*'
      });
    }
  }

  // Перенаправляет запрос к целевому API
  async forwardRequest(path, headers) {
    const fullUrl = new URL(path, this.API_URL);
    console.log('Request to:', fullUrl.toString());

    const apiResponse = await fetch(fullUrl, {
      headers: {
        ...headers,
        'Authorization': `Bearer ${this.API_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.text();
      throw new Error(`API error: ${apiResponse.status} - ${errorData}`);
    }

    return apiResponse;
  }

  // Обрабатывает CORS preflight (OPTIONS)
  handleOptionsRequest(headers) {
    const corsHeaders = new Headers(headers);
    corsHeaders.set('Cache-Control', 'public, max-age=86400');
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(null, { headers: corsHeaders });
  }

  // Формирует общие заголовки
  getCommonHeaders(requestOrigin) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${DEFAULT_CACHE_MAX_AGE}`,
      'Origin-Allowed': !requestOrigin || this.ALLOWED_ORIGINS.includes(requestOrigin),
      'Request-Origin': requestOrigin,
    });
    return headers;
  }

  // Универсальный метод для ошибок
  errorResponse(message, status, headers) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers
    });
  }
}

// Создаем прокси, чтобы перехватывать вызовы (дополнительный уровень контроля)
const apiProxyHandler = {
  get(target, prop) {
    if (prop === 'handleRequest') {
      return async function (request) {
        console.log(`[Proxy] Intercepted request: ${request.method} ${request.url}`);
        return target.handleRequest(request);
      };
    }
    return target[prop];
  }
};

const apiProxyInstance = new ApiProxy();
const proxiedApi = new Proxy(apiProxyInstance, apiProxyHandler);

// Экспортируем обработчик
export async function GET(request) {
  return proxiedApi.handleRequest(request);
}