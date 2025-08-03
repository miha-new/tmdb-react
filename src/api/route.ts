export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  
  if (!path) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  
  searchParams.forEach((value, key) => {
    if (key !== 'path') url.searchParams.append(key, value);
  });

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${process.env.API_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}