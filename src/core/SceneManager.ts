import { Scene } from '@babylonjs/core';
import { Engine } from './Engine';
import { MainLevel } from '../scenes/MainLevel';

/**
 * Manages scene transitions and lifecycle
 */
export class SceneManager {
    private engine: Engine;
    private currentScene: Scene | null = null;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public async loadMainScene(): Promise<void> {
        // Dispose of current scene if it exists
        if (this.currentScene) {
            this.currentScene.dispose();
        }

        // Create the main level
        const mainLevel = new MainLevel(this.engine.getEngine());
        this.currentScene = await mainLevel.initialize();

        // Wait for assets to be ready
        if (this.currentScene) {
            await this.currentScene.whenReadyAsync();
        }
    }

    public update(): void {
        // Update logic can be added here if needed
    }

    public render(): void {
        if (this.currentScene) {
            this.currentScene.render();
        }
    }

    public getCurrentScene(): Scene | null {
        return this.currentScene;
    }

    public dispose(): void {
        if (this.currentScene) {
            this.currentScene.dispose();
            this.currentScene = null;
        }
    }
}
