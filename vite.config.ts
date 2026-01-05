import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

// Get git commit message and hash and write to build-info.json
let commitMessage = 'Unknown';
let commitHash = 'Unknown';

const buildInfoPath = './build-info.json';

// Try to get from git commands and update build-info.json
try {
  commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  
  // Write to build-info.json
  const buildInfo = {
    hash: commitHash,
    message: commitMessage
  };
  writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  console.log('Updated build-info.json with git info');
} catch (e) {
  // If git fails (e.g., on Railway), read from existing build-info.json
  console.warn('Could not get git info, reading from build-info.json');
  try {
    const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf-8'));
    commitMessage = buildInfo.message || 'Unknown';
    commitHash = buildInfo.hash || 'Unknown';
  } catch (e2) {
    console.warn('Could not read build-info.json');
  }
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
