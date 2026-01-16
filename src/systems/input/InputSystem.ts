import { Scene, KeyboardEventTypes, PointerEventTypes, Vector3 } from '@babylonjs/core';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';

export interface InputState {
    movement: Vector3;
    isMouseDown: boolean;
    aimRay: { origin: Vector3; direction: Vector3 } | null;
}

/**
 * InputSystem handles keyboard and mouse input
 * Provides a clean interface for other systems to query input state
 */
export class InputSystem {
    private scene: Scene;
    private camera: ThirdPersonCamera;
    private inputMap: { [key: string]: boolean } = {};
    private isMouseDown: boolean = false;

    constructor(scene: Scene, camera: ThirdPersonCamera) {
        this.scene = scene;
        this.camera = camera;
        this.setupInputHandlers();
    }

    private setupInputHandlers(): void {
        // Mouse input
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                this.isMouseDown = true;
            } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
                this.isMouseDown = false;
            }
        });

        // Keyboard input
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();
            if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
                this.inputMap[key] = true;
            } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
                this.inputMap[key] = false;
            }
        });
    }

    /**
     * Get current input state
     */
    public getInputState(): InputState {
        const inputDir = new Vector3(0, 0, 0);
        const forward = this.camera.getForwardDirection();
        const right = this.camera.getRightDirection();

        if (this.inputMap["w"]) inputDir.addInPlace(forward);
        if (this.inputMap["s"]) inputDir.addInPlace(forward.scale(-1));
        if (this.inputMap["a"]) inputDir.addInPlace(right.scale(-1));
        if (this.inputMap["d"]) inputDir.addInPlace(right);

        if (inputDir.length() > 0) {
            inputDir.normalize();
        }

        return {
            movement: inputDir,
            isMouseDown: this.isMouseDown,
            aimRay: this.isMouseDown ? {
                origin: this.camera.getAimRay().origin,
                direction: this.camera.getAimRay().direction
            } : null
        };
    }

    /**
     * Check if a specific key is pressed
     */
    public isKeyPressed(key: string): boolean {
        return this.inputMap[key.toLowerCase()] || false;
    }

    /**
     * Check if mouse button is currently down
     */
    public isMouseButtonDown(): boolean {
        return this.isMouseDown;
    }

    /**
     * Get the aim ray from the camera
     */
    public getAimRay() {
        return this.camera.getAimRay();
    }
}
