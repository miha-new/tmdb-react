export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  
  if (!path) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const url = new URL(`${process.env.API_URL}${path}`);
  
  searchParams.forEach((value, key) => {
    if (key !== 'path') url.searchParams.append(key, value);
  });

  try {
    const response = await fetch(url.toString());
    
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    
    const headers = new Headers(response.headers);
    headers.set('Authorization', `Bearer ${process.env.API_ACCESS_TOKEN}`);
    headers.set('Accept', 'application/json');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}