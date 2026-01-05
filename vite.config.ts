import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  optimizeDeps: {
    exclude: ['@babylonjs/havok']
  },
  preview: {
    host: true,
    allowedHosts: ['paint-production-435f.up.railway.app']
  }
});
