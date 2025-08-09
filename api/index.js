export const runtime = 'edge';

export async function GET(request) {
  // 1. Получаем переменные окружения
  const API_URL = process.env.API_URL;
  const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN;

  // 5. Получаем path из URL
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing "path" parameter' }), {
      status: 400
    });
  }

  // 7. Формируем итоговый URL
  const fullUrl = new URL(path, API_URL);

  try {
    // 8. Отправляем запрос к API
    const apiResponse = await fetch(fullUrl, {
      headers: new Headers({
        'Authorization': `Bearer ${API_ACCESS_TOKEN}`,
        'Accept': 'application/json',
      }),
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
      status: 200
    });

  } catch (error) {
    // 11. Обрабатываем ошибки
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500
    });
  }
}