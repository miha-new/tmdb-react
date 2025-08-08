export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];

class ApiProxy {
  constructor() {
    this.API_URL = process.env.API_URL;
    this.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
  }

  // Основной метод для обработки запроса
  async handleRequest(request) {
    if (request.method === 'OPTIONS') {
      return this.handleOptionsRequest();
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return this.errorResponse('Method not allowed', 405);
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return this.errorResponse('Missing "path" parameter', 400);
    }

    try {
      const apiResponse = await this.forwardRequest(path);
      const data = await apiResponse.json();
      return new Response(JSON.stringify(data));
    } catch (error) {
      console.error('API failure:', error);
      return this.errorResponse(error.message, 500);
    }
  }

  // Перенаправляет запрос к целевому API
  async forwardRequest(path) {
    const fullUrl = new URL(path, this.API_URL);
    console.log('Request to:', fullUrl.toString());

    const apiResponse = await fetch(fullUrl, {
      headers: {
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
  handleOptionsRequest() {
    const corsHeaders = new Headers();
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(null, { headers: corsHeaders });
  }

  // Универсальный метод для ошибок
  errorResponse(message, status) {
    return new Response(JSON.stringify({ error: message }), { status });
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