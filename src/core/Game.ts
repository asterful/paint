import { Engine } from './Engine';
import { SceneManager } from './SceneManager';

declare const __COMMIT_MESSAGE__: string;
declare const __COMMIT_HASH__: string;

/**
 * Main game controller responsible for initialization and lifecycle management
 */
export class Game {
    private engine: Engine;
    private sceneManager: SceneManager;

    constructor(canvasId: string = 'renderCanvas') {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas element with id "${canvasId}" not found`);
        }

        this.engine = new Engine(canvas);
        this.sceneManager = new SceneManager(this.engine);
    }

    public async start(): Promise<void> {
        const loadingScreen = document.getElementById('loading-screen');
        
        // Initialize the main scene
        await this.sceneManager.loadMainScene();
        
        // Hide loading screen
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }

        // Display commit info
        this.displayBuildInfo();

        // Start the render loop
        this.engine.startRenderLoop(() => {
            this.sceneManager.update();
            this.sceneManager.render();
        });
    }

    private displayBuildInfo(): void {
        const commitHashBox = document.getElementById('commit-hash-box');
        const commitMessageBox = document.getElementById('commit-message-box');

        if (commitHashBox && typeof __COMMIT_HASH__ !== 'undefined') {
            commitHashBox.innerText = `Build: ${__COMMIT_HASH__}`;
        }

        if (commitMessageBox && typeof __COMMIT_MESSAGE__ !== 'undefined') {
            commitMessageBox.innerText = __COMMIT_MESSAGE__;
        }
    }

    public dispose(): void {
        this.sceneManager.dispose();
        this.engine.dispose();
    }
}
