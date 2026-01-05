import { Vector3, Scene, Mesh, Quaternion, HavokPlugin, PhysicsShapeCapsule, ShapeCastResult, MeshBuilder, Color3, StandardMaterial } from '@babylonjs/core';

interface SweepResult {
    hit: boolean;
    distance: number;
    normal: Vector3;
    point: Vector3;
}

export class CharacterController {
    private scene: Scene;
    private capsuleRadius: number;
    private capsuleHeight: number;
    private mesh: Mesh;
    private capsuleShape: PhysicsShapeCapsule;
    private havokPlugin: HavokPlugin;
    
    // Movement settings
    private readonly maxIterations: number = 5;
    private readonly collisionOffset: number = 0.01;
    
    // Simulation state
    private transientPosition: Vector3;
    private previousPosition: Vector3;
    
    // Fixed timestep accumulator
    private timeLeftOver: number = 0;
    private readonly fixedTimeStep: number = 1/60;
    

    constructor(scene: Scene, mesh: Mesh, radius: number, height: number) {
        this.scene = scene;
        this.mesh = mesh;
        this.capsuleRadius = radius;
        this.capsuleHeight = height;
        
        // Initialize positions
        this.transientPosition = mesh.position.clone();
        this.previousPosition = mesh.position.clone();
        
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

    public update(velocity: Vector3, deltaTime: number): void {
        deltaTime = Math.min(deltaTime, 0.1);
        this.timeLeftOver += deltaTime;
        
        while (this.timeLeftOver >= this.fixedTimeStep) {
            this.previousPosition = this.transientPosition.clone();
            this.simulate(velocity, this.fixedTimeStep);
            this.timeLeftOver -= this.fixedTimeStep;
        }
        const alpha = this.timeLeftOver / this.fixedTimeStep;
        
        this.mesh.position = Vector3.Lerp(
            this.previousPosition,
            this.transientPosition,
            alpha
        );
    }
    
    /**
     * Run one physics step - this is the actual character movement simulation
     * Always runs with a fixed deltaTime (1/60 second)
     */
    private simulate(velocity: Vector3, deltaTime: number): void {
        // Calculate total distance to move this frame
        const velocityMagnitude = velocity.length();
        if (velocityMagnitude === 0) return;
        
        let remainingDistance = velocityMagnitude * deltaTime;
        let remainingDirection = velocity.normalize();
        let currentPosition = this.transientPosition.clone();
        
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
        
        // Update simulated position
        this.transientPosition = currentPosition;
    }
    
    /**
     * Get the current simulated position (not the visual mesh position)
     */
    public getPosition(): Vector3 {
        return this.transientPosition.clone();
    }
    
    /**
     * Set the simulated position directly (bypasses interpolation for one frame)
     */
    public setPosition(position: Vector3): void {
        this.transientPosition = position.clone();
        this.previousPosition = position.clone();
        this.mesh.position.copyFrom(position);
    }
}
