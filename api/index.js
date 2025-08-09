export const runtime = 'edge';

const cache = new Map();

const isValidPath = (path) => {
  try {
    // Проверяем, что path является строкой и не содержит опасных символов
    return typeof path === 'string' && 
           path.length > 0 && 
           !path.includes('//') && 
           !path.startsWith('http://') && 
           !path.startsWith('https://');
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

  const { searchParams } = new URL(request.url);
  let path = searchParams.get('path');

  if (!path || !isValidPath(path)) {
    logRequest(method, path, 400, new Error('Invalid or missing "path" parameter'));
    return new Response(JSON.stringify({ error: 'Invalid or missing "path" parameter' }), { status: 400 });
  }

  // Добавляем / в начало, если его нет
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Формируем полный URL
  let fullUrl;
  try {
    fullUrl = new URL(API_URL + path);
  } catch (error) {
    logRequest(method, path, 400, error);
    return new Response(JSON.stringify({ error: 'Invalid API URL configuration' }), { status: 400 });
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