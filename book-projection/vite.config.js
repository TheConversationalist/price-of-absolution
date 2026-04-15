import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    host: true,
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  }
});
