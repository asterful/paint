import { Engine } from '@babylonjs/core';
import { createScene } from './scene';

declare const __COMMIT_MESSAGE__: string;
declare const __COMMIT_HASH__: string;

window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const engine = new Engine(canvas, true);
    
    const loadingScreen = document.getElementById("loading-screen")!;

    const scene = await createScene(engine);
    
    // Wait for all assets to be ready
    await scene.whenReadyAsync();
    
    // Hide loading screen
    loadingScreen.classList.add('hidden');
    
    // Start rendering
    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener("resize", () => {
        engine.resize();
    });

    // Display commit info
    const commitHashBox = document.getElementById("commit-hash-box")!;
    commitHashBox.innerText = `Build: ${__COMMIT_HASH__}`;
    
    const commitMessageBox = document.getElementById("commit-message-box")!;
    commitMessageBox.innerText = __COMMIT_MESSAGE__;
});
