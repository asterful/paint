import { 
    Scene, 
    MeshBuilder, 
    StandardMaterial, 
    Color3, 
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsBody
} from '@babylonjs/core';

export class Player {
    public mesh;
    public aggregate: PhysicsAggregate;
    private material: StandardMaterial;
    private targetAlpha: number = 1.0;
    private currentAlpha: number = 1.0;

    constructor(scene: Scene) {
        this.mesh = MeshBuilder.CreateCapsule("player", { radius: 0.4, height: 1.5 }, scene);
        this.mesh.position = new Vector3(0, 5, 0);
        
        this.material = new StandardMaterial("playerMat", scene);
        this.material.diffuseColor = new Color3(0, 0, 0); // Turn off diffuse
        this.material.specularColor = new Color3(0, 0, 0); // No shine
        this.material.emissiveColor = new Color3(0, 0.6, 1); // Use only emissive for flat color
        this.material.disableLighting = true; // Completely ignore scene lighting
        this.material.alpha = 1.0;
        this.mesh.material = this.material;
        
        this.aggregate = new PhysicsAggregate(
            this.mesh, 
            PhysicsShapeType.CAPSULE, 
            { mass: 1, friction: 1, restitution: 0 }, 
            scene
        );
        
        this.aggregate.body.setMassProperties({ 
            inertia: new Vector3(0, 0, 0) 
        });
        
        // Add damping to prevent bouncing and sliding
        this.aggregate.body.setLinearDamping(0.5);
        this.aggregate.body.setAngularDamping(1.0);
    }

    get position(): Vector3 {
        return this.mesh.position;
    }

    get body(): PhysicsBody {
        return this.aggregate.body;
    }

    public setTransparency(shouldBeTransparent: boolean): void {
        this.targetAlpha = shouldBeTransparent ? 0.3 : 1.0;
    }

    public update(): void {
        // Smooth alpha transition
        this.currentAlpha += (this.targetAlpha - this.currentAlpha) * 0.15;
        this.material.alpha = this.currentAlpha;
    }
}
