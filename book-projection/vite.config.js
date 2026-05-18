import { defineConfig } from 'vite';
import path from 'node:path';
import { repoAssetsBuildPlugin, repoAssetsDevPlugin } from './vite.repoAssetsPlugin.js';

export default defineConfig({
  plugins: [repoAssetsDevPlugin(), repoAssetsBuildPlugin()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/sync-ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true
      }
    },
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  }
});
