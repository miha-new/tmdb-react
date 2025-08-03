export const runtime = 'edge';

export async function GET(request) {

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }

  const apiUrl = process.env.API_URL;
  const url = new URL(`${apiUrl}${path}`);

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
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'API request failed' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}