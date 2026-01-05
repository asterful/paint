import { Vector3, Scene, Mesh, Quaternion, HavokPlugin, PhysicsShapeCapsule, ShapeCastResult, MeshBuilder, Color3, StandardMaterial } from '@babylonjs/core';

interface SweepResult {
    hit: boolean;
    distance: number;
    normal: Vector3;
    point: Vector3;
}

export class CharacterController {
    private scene: Scene;
    private position: Vector3;
    private capsuleRadius: number;
    private capsuleHeight: number;
    private mesh: Mesh;
    private capsuleShape: PhysicsShapeCapsule;
    private havokPlugin: HavokPlugin;
    private readonly maxIterations: number = 5;
    private readonly collisionOffset: number = 0.01;
    

    constructor(scene: Scene, mesh: Mesh, radius: number, height: number) {
        this.scene = scene;
        this.mesh = mesh;
        this.position = mesh.position.clone();
        this.capsuleRadius = radius;
        this.capsuleHeight = height;
        
        this.capsuleShape = new PhysicsShapeCapsule(
            new Vector3(0, -this.capsuleHeight * 0.5 + this.capsuleRadius, 0),
            new Vector3(0, this.capsuleHeight * 0.5 - this.capsuleRadius, 0),
            this.capsuleRadius,
            this.scene
        );
        
        const physicsEngine = scene.getPhysicsEngine();
        if (!physicsEngine) {
            throw new Error("No physics engine found - physics must be enabled on the scene");
        }
        
        this.havokPlugin = physicsEngine.getPhysicsPlugin() as HavokPlugin;
        if (!this.havokPlugin) {
            throw new Error("Havok plugin not found");
        }
    }


    private sweep(fromPosition: Vector3, direction: Vector3, distance: number): SweepResult {
        // Setup result object
        const result: SweepResult = {
            hit: false,
            distance: 0,
            normal: Vector3.Up(),
            point: fromPosition.clone()
        };

        // Perform shape cast
        const endPosition = fromPosition.add(direction.scale(distance));
        const shapeLocalResult = new ShapeCastResult();
        const hitWorldResult = new ShapeCastResult();

        this.havokPlugin.shapeCast(
            {
                shape: this.capsuleShape,
                rotation: Quaternion.Identity(),
                startPosition: fromPosition,
                endPosition: endPosition,
                shouldHitTriggers: false
            },
            shapeLocalResult,
            hitWorldResult
        );

        // Process results
        if (hitWorldResult.hasHit && hitWorldResult.body) {
            result.hit = true;
            result.distance = distance * hitWorldResult.hitFraction;
            result.normal = hitWorldResult.hitNormal;
            result.point = hitWorldResult.hitPoint;
        }

        return result;
    }


    private getDirectionTangentToSurface(direction: Vector3, surfaceNormal: Vector3): Vector3 {
        const characterUp = Vector3.Up();
        const directionRight = Vector3.Cross(direction, characterUp);
        const tangentDirection = Vector3.Cross(surfaceNormal, directionRight);
        return tangentDirection.normalize();
    }


    private handleVelocityProjection(velocity: Vector3, hitNormal: Vector3): Vector3 {
        return this.getDirectionTangentToSurface(velocity, hitNormal);
    }

    public move(velocity: Vector3, deltaTime: number): void {
        // Calculate total distance to move this frame
        const velocityMagnitude = velocity.length();
        if (velocityMagnitude === 0) return;
        
        let remainingDistance = velocityMagnitude * deltaTime;
        let remainingDirection = velocity.normalize();
        let currentPosition = this.position.clone();
        
        // Iteratively sweep and slide along surfaces
        for (let i = 0; i < this.maxIterations; i++) {
            if (remainingDistance <= 0) break;
            
            const hit = this.sweep(currentPosition, remainingDirection, remainingDistance);
            
            if (hit.hit) {
                const moveDistance = Math.max(0, hit.distance - this.collisionOffset);
                currentPosition.addInPlace(remainingDirection.scale(moveDistance));
                remainingDistance -= hit.distance;
                remainingDirection = this.handleVelocityProjection(remainingDirection, hit.normal);
            } else {
                currentPosition.addInPlace(remainingDirection.scale(remainingDistance));
                break;
            }
        }
        
        // Update position and sync mesh
        this.position = currentPosition;
        this.mesh.position.copyFrom(this.position);
    }
}
