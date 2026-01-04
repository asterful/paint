import { 
    Scene, 
    MeshBuilder, 
    StandardMaterial, 
    Color3, 
    Vector3,
    Mesh
} from '@babylonjs/core';
import { CharacterController } from './CharacterController';

export class KinematicsPlayer {
    public mesh: Mesh;
    private material: StandardMaterial;
    private speed: number;
    private controller: CharacterController;

    constructor(scene: Scene, controller: CharacterController, speed: number = 7.5) {
        this.speed = speed;
        this.controller = controller;
        
        this.mesh = MeshBuilder.CreateCapsule("kinematic_player", { radius: 0.4, height: 1.5 }, scene);
        this.mesh.position = new Vector3(0, 5, 0);
        
        this.material = new StandardMaterial("kinematicPlayerMat", scene);
        this.material.emissiveColor = new Color3(1, 0.6, 0); // Orange
        this.material.disableLighting = true;
        this.mesh.material = this.material;
    }

    get position(): Vector3 {
        return this.mesh.position;
    }

    public move(inputDirection: Vector3, deltaTime: number): void {
        this.controller.move(this, inputDirection.scale(this.speed), deltaTime);
    }

    public setTransparency(isTransparent: boolean): void {
        this.material.alpha = isTransparent ? 0.3 : 1.0;
    }

    public update(): void {
        // Override in subclass if needed
    }
}
