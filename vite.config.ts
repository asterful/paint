import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { execSync } from 'child_process';

// Get git commit message and hash
let commitMessage = 'Unknown';
let commitHash = 'Unknown';
try {
  commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Could not get git commit info');
}

export default defineConfig({
  plugins: [glsl()],
  optimizeDeps: {
    exclude: ['@babylonjs/havok']
  },
  preview: {
    host: true,
    allowedHosts: ['paint-production-435f.up.railway.app']
  },
  define: {
    __COMMIT_MESSAGE__: JSON.stringify(commitMessage),
    __COMMIT_HASH__: JSON.stringify(commitHash)
  }
});
