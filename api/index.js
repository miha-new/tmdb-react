export const runtime = 'edge';

const cache = new Map();

const normalizePath = (path) => {
  // Удаляем все начальные и конечные слэши
  path = path.replace(/^\/+|\/+$/g, '');
  // Добавляем один слэш в начало
  return path ? '/' + path : '/';
};

const isValidPath = (path) => {
  try {
    return typeof path === 'string' && 
           path.length > 0 &&
           !path.includes('://') && // Защита от абсолютных URL
           !path.includes('..') &&  // Защита от path traversal
           !/\/\/+/.test(path);     // Запрет множественных слэшей
  } catch {
    return false;
  }
};

const logRequest = (method, path, status, error = null) => {
  console.log(`[${new Date().toISOString()}] ${method} ${path} -> ${status}`, error ? `\nERROR: ${error.message}` : '');
};

export default async function handler(request) {
  const { method } = request;
  const API_URL = process.env.API_URL;
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;

  // Проверяем что API_URL установлен и валиден
  if (!API_URL) {
    logRequest(method, 'MISSING_API_URL', 500, new Error('API_URL is not configured'));
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  }

  let baseUrl;
  try {
    // Добавляем протокол, если отсутствует
    const urlToParse = API_URL.includes('://') ? API_URL : `https://${API_URL}`;
    baseUrl = new URL(urlToParse);
  } catch (error) {
    logRequest(method, 'INVALID_API_URL', 500, error);
    return new Response(JSON.stringify({ error: 'Invalid API URL configuration' }), { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get('path');

  if (!pathParam || !isValidPath(pathParam)) {
    logRequest(method, pathParam || 'empty', 400, new Error('Invalid or missing "path" parameter'));
    return new Response(JSON.stringify({ error: 'Invalid or missing "path" parameter' }), { status: 400 });
  }

  // Нормализуем путь
  const normalizedPath = normalizePath(pathParam);
  
  // Создаем полный URL безопасным способом
  let fullUrl;
  try {
    // Убедимся, что baseUrl заканчивается на слэш
    const baseUrlStr = baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl.toString()}/`;
    fullUrl = new URL(normalizedPath.substring(1), baseUrlStr);
  } catch (error) {
    logRequest(method, normalizedPath, 400, error);
    return new Response(JSON.stringify({ error: 'Failed to construct API URL' }), { status: 400 });
  }

  // Проверяем что конечный URL принадлежит нашему домену
  if (fullUrl.origin !== baseUrl.origin) {
    logRequest(method, fullUrl.toString(), 400, new Error('Invalid URL origin'));
    return new Response(JSON.stringify({ error: 'Invalid path parameter' }), { status: 400 });
  }

  const cacheKey = `${method}:${fullUrl}`;

  if (method === 'GET' && cache.has(cacheKey)) {
    logRequest(method, fullUrl.toString(), 200);
    return new Response(JSON.stringify(cache.get(cacheKey)), { status: 200 });
  }

  try {
    const headers = new Headers({
      'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
      'Accept': 'application/json',
    });

    const options = {
      method,
      headers,
    };

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const body = await request.json();
      options.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }

    const apiResponse = await fetch(fullUrl, options);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      logRequest(method, fullUrl.toString(), apiResponse.status, new Error(errorText));
      throw new Error(`API returned ${apiResponse.status}: ${apiResponse.statusText}`);
    }

    const data = await apiResponse.json();

    if (method === 'GET') {
      cache.set(cacheKey, data);
    }

    logRequest(method, fullUrl.toString(), 200);
    return new Response(JSON.stringify(data), { status: 200 });

  } catch (error) {
    logRequest(method, fullUrl.toString(), 500, error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;