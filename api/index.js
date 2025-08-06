export const runtime = 'edge';

export async function GET(request) {
  const ALLOWED_METHODS = ['GET', 'OPTIONS'];
  const ALLOWED_PATHS = ['movie/', 'tv/'];
  const API_URL = process.env.API_URL || new URL(request.url).origin;
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];

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
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*'
      }
    });
  }

  const url = new URL(path, API_URL);
  console.log('Final URL:', url.toString());
  
  try {
    console.log('Fetching URL:', url.toString());
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Data received:', data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...(isOriginAllowed && { 'Access-Control-Allow-Origin': requestOrigin }),
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Full error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'API request failed' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*'
      }
    });
  }
}