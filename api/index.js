import ApiRequestBuilder from './ApiRequestBuilder'
import MiddlewareChain from './MiddlewareChain'
import RequestStrategy from './RequestStrategy'

export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];

// Decorator для динамического расширения методов
function withLogging(propertyKey, descriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args) {
    console.log(`Calling ${propertyKey} with args:`, args);
    try {
      const result = await originalMethod.apply(this, args);
      console.log(`Method ${propertyKey} succeeded`);
      return result;
    } catch (error) {
      console.error(`Method ${propertyKey} failed:`, error);
      throw error;
    }
  };
  return descriptor;
}

class ApiProxy {
  constructor() {
    this.API_URL = process.env.API_URL;
    this.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
    this.requestStrategy = new RequestStrategy();
    this.middlewareChain = new MiddlewareChain();

    // Настройка стратегий
    this.requestStrategy
      .setStrategy('GET', (path) => this.forwardRequest(path))
      .setStrategy('OPTIONS', () => this.handleOptionsRequest());
  }

  // Основной метод для обработки запроса
  async handleRequest(request) {
    // Применяем цепочку middleware
    const middlewareResult = await this.middlewareChain.execute(request);
    if (middlewareResult instanceof Response) {
      return middlewareResult;
    }

    try {
      return await this.requestStrategy.execute(request.method, request);
    } catch (error) {
      console.error('Request handling failed:', error);
      return this.errorResponse(error.message, error.status || 500);
    }
  }

  // Перенаправляет запрос к целевому API
  @withLogging
  async forwardRequest(path) {
    const builder = new ApiRequestBuilder(this.API_URL)
      .setHeader('Authorization', `Bearer ${this.API_ACCESS_TOKEN}`)
      .setHeader('Accept', 'application/json');

    const { url, headers } = builder.build(path);
    console.log('Request to:', url);

    const apiResponse = await fetch(url, { headers });

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

// Middleware примеры
function validateRequest(request) {
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response(null, { status: 405 });
  }
  return request;
}

function logRequest(request) {
  console.log(`Incoming request: ${request.method} ${request.url}`);
  return request;
}

// Создаем прокси
const apiProxyInstance = new ApiProxy();
// Добавляем middleware
apiProxyInstance.middlewareChain
  .use(logRequest)
  .use(validateRequest);

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

const proxiedApi = new Proxy(apiProxyInstance, apiProxyHandler);

// Экспортируем обработчик
export async function GET(request) {
  return proxiedApi.handleRequest(request);
}

export async function OPTIONS(request) {
  return proxiedApi.handleRequest(request);
}