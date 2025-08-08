export const runtime = 'edge';

const ALLOWED_METHODS = ['GET', 'OPTIONS'];
const DEFAULT_CACHE_MAX_AGE = 3600;

const buildHeaders = (options = {}) => {
  const {
    originAllowed = false,
    requestOrigin = null,
    contentType = 'application/json',
    cacheControl = `public, max-age=${DEFAULT_CACHE_MAX_AGE}`,
    customHeaders = {}
  } = options;

  const headers = new Headers();

  if (contentType) headers.set('Content-Type', contentType);
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  
  if (originAllowed && requestOrigin) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
  }

  Object.entries(customHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return headers;
};

const errorResponse = (message, status, options = {}) => {
  const headers = buildHeaders(options);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers
  });
};

export async function GET(request) {
  const API_URL = process.env.API_URL?.endsWith('/') 
    ? process.env.API_URL 
    : process.env.API_URL + '/';
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];

  const requestOrigin = request.headers.get('Origin');
  const isOriginAllowed = !requestOrigin || ALLOWED_ORIGINS.includes(requestOrigin);
  const commonHeadersOptions = {
    originAllowed: isOriginAllowed,
    requestOrigin
  };

  if (request.method === 'OPTIONS') {
    const headers = buildHeaders({
      ...commonHeadersOptions,
      cacheControl: 'public, max-age=86400'
    });
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return new Response(null, { headers });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return errorResponse('Method not allowed', 405, commonHeadersOptions);
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return errorResponse('Missing "path" parameter', 400, commonHeadersOptions);
  }

  try {
    const fullUrl = new URL(path, API_URL);
    console.log('Request to:', fullUrl.toString());

    const apiResponse = await fetch(fullUrl, {
      headers: buildHeaders({
        customHeaders: {
          'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
          'Accept': 'application/json'
        }
      })
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.text();
      throw new Error(`API error: ${apiResponse.status} - ${errorData}`);
    }

    const data = await apiResponse.json();
    const headers = buildHeaders(commonHeadersOptions);
    
    return new Response(JSON.stringify(data), { headers });

  } catch (error) {
    console.error('API failure:', error);
    return errorResponse(error.message, 500, {
      ...commonHeadersOptions,
      requestOrigin: ALLOWED_ORIGINS[0] || '*'
    });
  }
}