import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  server: {
    host: true,
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  }
});
