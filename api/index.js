export const runtime = 'edge';

export default async function handlerMethod(request) {
  const API_URL = process.env.API_URL;
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing "path" parameter' }), {
      status: 400
    });
  }

  const fullUrl = new URL(path, API_URL);

  try {
    const apiResponse = await fetch(fullUrl, {
      headers: new Headers({
        'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
        'Accept': 'application/json',
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[ERROR] API response:', errorText);
      throw new Error(`API returned ${apiResponse.status}: ${apiResponse.statusText}`);
    }

    const data = await apiResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500
    });
  }
}

export const GET = handlerMethod;