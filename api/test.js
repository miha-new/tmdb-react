export const runtime = 'edge';

// Кеш для GET-запросов (простой in-memory cache)
// const cache = new Map();

// Валидация URL (защита от SSRF и неверных путей)
// const isValidPath = (path) => {
//   try {
//     const url = new URL(path, process.env.API_URL);
//     return url.hostname === new URL(process.env.API_URL).hostname;
//   } catch {
//     return false;
//   }
// };

// Логирование запросов и ошибок
// const logRequest = (method, path, status, error = null) => {
//   console.log(`[${new Date().toISOString()}] ${method} ${path} -> ${status}`, error ? `\nERROR: ${error.message}` : '');
// };

// Обработчик для всех методов
export default async function handlerMethod(request) {
  const { method } = request;
  const API_URL = process.env.API_URL;
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  // Валидация параметров
  // if (!path || !isValidPath(path)) {
  if (!path) {
    // logRequest(method, path, 400, new Error('Invalid or missing "path" parameter'));
    return new Response(JSON.stringify({ error: 'Invalid or missing "path" parameter' }), { status: 400 });
  }

  const fullUrl = new URL(path, API_URL);
  // const cacheKey = `${method}:${fullUrl}`;

  // Кеширование GET-запросов
  // if (method === 'GET' && cache.has(cacheKey)) {
  //   logRequest(method, fullUrl, 200);
  //   return new Response(JSON.stringify(cache.get(cacheKey)), { status: 200 });
  // }

  try {
    const headers = new Headers({
      'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
      'Accept': 'application/json',
    });

    // Поддержка разных HTTP-методов
    const options = {
      method,
      headers,
    };

    // if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    //   const body = await request.json();
    //   options.body = JSON.stringify(body);
    //   headers.set('Content-Type', 'application/json');
    // }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      // const errorText = await apiResponse.text();
      // logRequest(method, fullUrl, apiResponse.status, new Error(errorText));
      throw new Error(`API returned ${apiResponse.status}: ${apiResponse.statusText}`);
    }

    const data = await apiResponse.json();

    // Кеширование успешных GET-ответов
    // if (method === 'GET') {
    //   cache.set(cacheKey, data);
    // }

    // logRequest(method, fullUrl, 200);
    return new Response(JSON.stringify(data), { status: 200 });

  } catch (error) {
    // logRequest(method, fullUrl, 500, error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500 });
  }
}

// Поддержка разных HTTP-методов через один обработчик
export const GET = handlerMethod;
// export const POST = handlerMethod;
// export const PUT = handlerMethod;
// export const PATCH = handlerMethod;
// export const DELETE = handlerMethod;