import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'https://api.themoviedb.org/3/',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            return url.searchParams.get('path') || ''
          },
          headers: {
            'Authorization': `Bearer ${env.API_ACCESS_TOKEN}`,
            'Accept': 'application/json',
          },
        },
      },
    },
  }
})
