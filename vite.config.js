import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0', // Доступ с других устройств в локальной сети
      port: 5173,
      headers: {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*', // Можно указать несколько доменов
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      proxy: {
        '/api': {
          target: env.API_URL,
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost');
            return url.searchParams.get('path') || '';
          },
          headers: {
            'Authorization': `Bearer ${env.API_ACCESS_TOKEN}`,
            'Accept': 'application/json',
          },
          onError: (err, req, res) => {
            console.error('Proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error' }));
          },
        },
      },
    },
  };
});