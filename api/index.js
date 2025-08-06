console.log('API_URL', process.env.API_URL)

export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];
const ALLOWED_PATHS = ['movie/', 'tv/'];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || []; // Например: "https://site1.com,https://site2.com"

export async function GET(request) {
  const requestOrigin = request.headers.get('Origin');

  // Проверяем, разрешён ли Origin (если запрос не из браузера, Origin может отсутствовать)
  const isOriginAllowed = !requestOrigin || ALLOWED_ORIGINS.includes(requestOrigin);

  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
      }
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  }

  // Остальная логика обработки GET-запроса...
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  
  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing path' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
      }
    });
  }

  if (!ALLOWED_PATHS.some(allowedPath => path.startsWith(allowedPath))) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  }

  const apiUrl = process.env.API_URL;
  const url = new URL(path, apiUrl);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.API_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'API request failed' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  }
}