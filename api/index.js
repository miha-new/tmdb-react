export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];
const ALLOWED_PATHS = ['movie/', 'tv/'];

export async function GET(request) {
  // 1. Получаем переменные окружения
  const API_URL = process.env.API_URL?.endsWith('/') 
    ? process.env.API_URL 
    : process.env.API_URL + '/';
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];

  console.log('[DEBUG] API_URL:', API_URL); // Логируем для проверки

  // 2. Проверяем CORS
  const requestOrigin = request.headers.get('Origin');
  const isOriginAllowed = !requestOrigin || ALLOWED_ORIGINS.includes(requestOrigin);

  // 3. Обрабатываем OPTIONS (для CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // 4. Проверяем метод
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
      }
    });
  }

  // 5. Получаем path из URL
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing "path" parameter' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
      }
    });
  }

  // 6. Проверяем, что path разрешён
  if (!ALLOWED_PATHS.some(allowedPath => path.startsWith(allowedPath))) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] || '*',
      }
    });
  }

  // 7. Формируем итоговый URL
  const fullUrl = new URL(path, API_URL);
  console.log('[DEBUG] Final request URL:', fullUrl.toString()); // Логируем URL

  try {
    // 8. Отправляем запрос к API
    const apiResponse = await fetch(fullUrl, {
      headers: {
        'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
        'Accept': 'application/json',
      },
    });

    // 9. Проверяем статус ответа
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[ERROR] API response:', errorText);
      throw new Error(`API returned ${apiResponse.status}: ${apiResponse.statusText}`);
    }

    // 10. Возвращаем данные
    const data = await apiResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
      },
    });

  } catch (error) {
    // 11. Обрабатываем ошибки
    console.error('[ERROR] Full error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] || '*',
      },
    });
  }
}