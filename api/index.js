export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];
const ALLOWED_PATHS = ['movie/', 'tv/']; // Пример допустимых префиксов

export async function GET(request) {
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com'
      }
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'public, max-age=86400' // Кэширование предварительных запросов
      }
    });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  
  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing path' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com'
      }
    });
  }

  if (!ALLOWED_PATHS.some(allowedPath => path.startsWith(allowedPath))) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com'
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

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com',
        'Cache-Control': 'public, max-age=3600' // Кэширование на 1 час
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
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : 'your-production-domain.com'
      }
    });
  }
}