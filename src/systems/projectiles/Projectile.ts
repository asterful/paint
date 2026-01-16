import { 
    Scene, 
    Vector3, 
    Mesh, 
    MeshBuilder, 
    StandardMaterial, 
    Color3, 
    Ray, 
    Observer,
    PickingInfo
} from '@babylonjs/core';

/**
 * Individual projectile entity
 */
export class Projectile {
    private mesh: Mesh;
    private velocity: Vector3;
    private scene: Scene;
    private isDisposed: boolean = false;
    private renderObserver: Observer<Scene> | null = null;
    private gravity: Vector3 = new Vector3(0, -9.81, 0);
    private lifeTime: number = 3.0; // Seconds before auto-destroy
    private onHitCallback?: (pickInfo: PickingInfo) => void;

    constructor(
        scene: Scene, 
        startPosition: Vector3, 
        direction: Vector3, 
        speed: number,
        onHit?: (pickInfo: PickingInfo) => void,
        radius: number = 0.15
    ) {
        this.scene = scene;
        this.velocity = direction.normalize().scale(speed);
        this.onHitCallback = onHit;

        // Create projectile mesh
        this.mesh = MeshBuilder.CreateSphere("projectile", { diameter: radius * 2 }, scene);
        this.mesh.position = startPosition.clone();
        this.mesh.isPickable = false; // Don't let raycasts hit the projectile itself
        
        const material = new StandardMaterial("projectileMat", scene);
        material.emissiveColor = new Color3(0, 0.2, 0.8); // Paint color
        material.disableLighting = true;
        this.mesh.material = material;

        // Register update loop
        this.renderObserver = scene.onBeforeRenderObservable.add(() => this.update());
    }

    private update(): void {
        if (this.isDisposed) return;

        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
        this.lifeTime -= deltaTime;
        if (this.lifeTime <= 0) {
            this.dispose();
            return;
        }

        // Apply Gravity
        this.velocity.addInPlace(this.gravity.scale(deltaTime));

        // Calculate next position
        const stepDistance = this.velocity.length() * deltaTime;
        const direction = this.velocity.normalizeToNew();
        
        // Raycast for collision detection (prevent tunneling)
        const ray = new Ray(this.mesh.position, direction, stepDistance);
        
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            return mesh !== this.mesh && mesh.isPickable && mesh.isVisible && mesh.name !== "player"; 
        });

        if (hit && hit.hit && hit.pickedPoint) {
            // Move to hit point
            this.mesh.position = hit.pickedPoint;
            
            // Trigger hit callback
            if (this.onHitCallback) {
                this.onHitCallback(hit);
            }
            
            // Destroy projectile
            this.dispose();
        } else {
            // Move projectile
            this.mesh.position.addInPlace(direction.scale(stepDistance));
        }
    }

    public dispose(): void {
        if (this.isDisposed) return;
        this.isDisposed = true;
        
        this.mesh.dispose();
        if (this.renderObserver) {
            this.scene.onBeforeRenderObservable.remove(this.renderObserver);
        }
    }
}
