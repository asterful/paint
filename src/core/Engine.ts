import { Engine as BabylonEngine } from '@babylonjs/core';

/**
 * Engine wrapper to manage the Babylon.js engine lifecycle
 */
export class Engine {
    private engine: BabylonEngine;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement, antialias: boolean = true) {
        this.canvas = canvas;
        this.engine = new BabylonEngine(canvas, antialias);
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    public getEngine(): BabylonEngine {
        return this.engine;
    }

    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    public startRenderLoop(callback: () => void): void {
        this.engine.runRenderLoop(callback);
    }

    public dispose(): void {
        this.engine.dispose();
    }
}
