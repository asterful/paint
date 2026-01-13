import { 
    Scene, 
    MeshBuilder, 
    StandardMaterial, 
    Color3, 
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsBody,
    Mesh
} from '@babylonjs/core';

export class PhysicsPlayer {
    public mesh: Mesh;
    public aggregate: PhysicsAggregate;
    private material: StandardMaterial;
    private speed: number;

    constructor(scene: Scene, speed: number = 7.5) {
        this.speed = speed;
        
        this.mesh = MeshBuilder.CreateCapsule("player", { radius: 0.4, height: 1.5 }, scene);
        this.mesh.position = new Vector3(0, 5, 0);
        
        this.material = new StandardMaterial("playerMat", scene);
        this.material.emissiveColor = new Color3(0, 0.6, 1);
        this.material.disableLighting = true;
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
        
        this.aggregate.body.setLinearDamping(0.5);
        this.aggregate.body.setAngularDamping(1.0);
    }

    get position(): Vector3 {
        return this.mesh.position;
    }

    get body(): PhysicsBody {
        return this.aggregate.body;
    }

    public move(inputDirection: Vector3): void {
        const vel = this.body.getLinearVelocity();
        const horizontalVelocity = inputDirection.scale(this.speed);
        
        this.body.setLinearVelocity(new Vector3(
            horizontalVelocity.x, 
            vel.y, 
            horizontalVelocity.z
        ));
        
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
