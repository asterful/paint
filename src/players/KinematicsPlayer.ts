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
    private capsuleRadius: number = 0.4;
    private capsuleHeight: number = 1.5;
    private gravity: number = -5; // constant downward velocity (m/s)

    constructor(scene: Scene, speed: number) {
        this.speed = speed;
        
        this.mesh = MeshBuilder.CreateCapsule("player", { 
            radius: this.capsuleRadius, 
            height: this.capsuleHeight 
        }, scene);
        this.mesh.position = new Vector3(0, 5, 0);
        
        this.material = new StandardMaterial("kinematicPlayerMat", scene);
        this.material.emissiveColor = new Color3(1, 0.6, 0); // Orange
        this.material.disableLighting = true;
        this.mesh.material = this.material;
        
        // Create controller after mesh is ready
        this.controller = new CharacterController(scene, this.mesh, this.capsuleRadius, this.capsuleHeight);
    }

    get position(): Vector3 {
        return this.mesh.position;
    }

    public move(inputDirection: Vector3, deltaTime: number): void {
        // Only apply gravity when not grounded
        const verticalVelocity = this.controller.isGrounded() ? 0 : this.gravity;
        
        // Create velocity vector
        const velocity = new Vector3(
            inputDirection.x * this.speed,
            verticalVelocity,
            inputDirection.z * this.speed
        );
        
        this.controller.update(velocity, deltaTime);
        
        // Rotate character to face movement direction
        if (inputDirection.length() > 0.1) {
            const targetAngle = Math.atan2(inputDirection.x, inputDirection.z);
            this.mesh.rotation.y = targetAngle;
        }
    }

    public setTransparency(isTransparent: boolean): void {
        this.material.alpha = isTransparent ? 0.3 : 1.0;
    }

    public update(): void {
        // Override in subclass if needed
    }
}
