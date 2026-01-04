import { Vector3, Scene } from '@babylonjs/core';

export class CharacterController {
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public move(player: any, velocity: Vector3, deltaTime: number): void {
        // TODO : Implement character controller movement logic
    }
}
