import { Engine } from '@babylonjs/core';
import { createScene } from './scene';

window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const engine = new Engine(canvas, true);

    const scene = await createScene(engine);

    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener("resize", () => {
        engine.resize();
    });

    canvas.addEventListener("click", () => {
        canvas.focus();
    });
});
