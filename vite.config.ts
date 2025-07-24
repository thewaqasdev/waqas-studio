import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5000, // Recommended port for accessibility
      allowedHosts: ['2c5686b9-6b2e-4982-b83e-bedcc014ee69-00-352mu9wv0kg23.sisko.replit.dev'] // Your allowed host
    }
  };
});