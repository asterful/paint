import { Vector3, Scene, Mesh, Quaternion, HavokPlugin, PhysicsShapeCapsule, ShapeCastResult } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';

interface SweepResult {
    hit: boolean;
    distance: number;
    normal: Vector3;
    point: Vector3;
}

interface GroundingReport {
    isStableOnGround: boolean;
    foundAnyGround: boolean;
    groundNormal: Vector3;
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
    private readonly maxStableSlopeAngle: number = 60; // degrees
    
    // Ground detection settings
    private readonly minimumGroundProbingDistance: number = 0.005;
    private readonly groundProbingBackstepDistance: number = 0.1;
    
    // Simulation state
    private transientPosition: Vector3;
    private previousPosition: Vector3;
    
    // Grounding state
    private groundingStatus: GroundingReport;
    private lastGroundingStatus: GroundingReport;
    private lastMovementIterationFoundAnyGround: boolean = false;
    
    // Fixed timestep accumulator
    private timeLeftOver: number = 0;
    private readonly fixedTimeStep: number = 1/60;
    
    // Debug UI
    private debugText: TextBlock;
    private guiTexture: AdvancedDynamicTexture;
    

    constructor(scene: Scene, mesh: Mesh, radius: number, height: number) {
        this.scene = scene;
        this.mesh = mesh;
        this.capsuleRadius = radius;
        this.capsuleHeight = height;
        
        // Initialize positions
        this.transientPosition = mesh.position.clone();
        this.previousPosition = mesh.position.clone();
        
        // Initialize grounding
        this.groundingStatus = {
            isStableOnGround: false,
            foundAnyGround: false,
            groundNormal: Vector3.Up()
        };
        this.lastGroundingStatus = {
            isStableOnGround: false,
            foundAnyGround: false,
            groundNormal: Vector3.Up()
        };
        
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
        
        // Setup debug UI
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.debugText = new TextBlock();
        this.debugText.text = "Grounded: false";
        this.debugText.color = "white";
        this.debugText.fontSize = 24;
        this.debugText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
        this.debugText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;
        this.debugText.top = "20px";
        this.debugText.left = "20px";
        this.guiTexture.addControl(this.debugText);
    }


    // Performs a sweep test from a position in a direction for a certain distance
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


    // Determines if a surface normal is stable (walkable) based on slope angle
    private isStableOnNormal(normal: Vector3): boolean {
        const characterUp = Vector3.Up();
        const angleInRadians = Math.acos(Vector3.Dot(characterUp, normal));
        const angleInDegrees = angleInRadians * (180 / Math.PI);
        return angleInDegrees <= this.maxStableSlopeAngle;
    }


    // Gets the direction tangent to a surface, maintaining intended movement direction
    private getDirectionTangentToSurface(direction: Vector3, surfaceNormal: Vector3): Vector3 {
        const characterUp = Vector3.Up();
        const directionRight = Vector3.Cross(direction, characterUp);
        
        // Handle edge case: moving perfectly up/down
        if (directionRight.lengthSquared() < 0.0001) {
            const dot = Vector3.Dot(direction, surfaceNormal);
            return direction.subtract(surfaceNormal.scale(dot)).normalize();
        }
        
        const tangentDirection = Vector3.Cross(surfaceNormal, directionRight);
        return tangentDirection.normalize();
    }


    // Probes for ground below the character and updates grounding status
    private probeGround(): void {
        // Determine probe distance based on previous grounding state
        let probingDistance = this.minimumGroundProbingDistance;
        
        if (this.lastGroundingStatus.isStableOnGround || this.lastMovementIterationFoundAnyGround) {
            // If was grounded or hit ground during movement, probe deeper to maintain contact on slopes
            probingDistance = Math.max(this.capsuleRadius, probingDistance);
        }
        
        // Sweep downward from slightly above current position
        const probeStart = this.transientPosition.add(Vector3.Up().scale(this.groundProbingBackstepDistance));
        const probeDistance = probingDistance + this.groundProbingBackstepDistance;
        
        const hit = this.sweep(probeStart, Vector3.Down(), probeDistance);
        
        if (hit.hit) {
            // Adjust distance to account for backstep
            const actualDistance = hit.distance - this.groundProbingBackstepDistance;
            
            this.groundingStatus.foundAnyGround = true;
            this.groundingStatus.groundNormal = hit.normal;
            
            // Check if ground is stable (within slope angle)
            const isStable = this.isStableOnNormal(hit.normal);
            
            if (isStable) {
                this.groundingStatus.isStableOnGround = true;
                
                // Ground snapping: move character down to maintain contact
                if (actualDistance > 0) {
                    this.transientPosition.subtractInPlace(Vector3.Up().scale(actualDistance - this.collisionOffset));
                }
            }
        }
    }

    /**
     * Projects velocity based on grounding state and surface stability
     * Implements 4 cases:
     * 1. Grounded + Stable Hit (slope walking)
     * 2. Grounded + Unstable Hit (wall sliding while grounded)
     * 3. Airborne + Stable Hit (landing)
     * 4. Airborne + Unstable Hit (wall hit in air)
     */
    private handleVelocityProjection(velocity: Vector3, hitNormal: Vector3): Vector3 {
        const isGrounded = this.groundingStatus.isStableOnGround;
        const isHitStable = this.isStableOnNormal(hitNormal);
        const characterUp = Vector3.Up();
        
        if (isGrounded) {
            if (isHitStable) {
                // Case 1: Grounded + Stable Hit (slope walking)
                // Maintain full speed, reorient along new slope
                const tangentDirection = this.getDirectionTangentToSurface(velocity, hitNormal);
                return tangentDirection.scale(velocity.length());
            } else {
                // Case 2: Grounded + Unstable Hit (wall while grounded)
                // Modify obstruction normal to prevent upward deflection
                const groundNormal = this.groundingStatus.groundNormal;
                
                // Get obstruction normal perpendicular to both ground and character up
                const obstructionLeft = Vector3.Cross(groundNormal, hitNormal).normalize();
                const obstructionNormal = Vector3.Cross(obstructionLeft, characterUp).normalize();
                
                // Now use this modified normal for tangent projection
                const obstructionRight = Vector3.Cross(obstructionNormal, groundNormal).normalize();
                const obstructionUp = Vector3.Cross(obstructionRight, obstructionNormal).normalize();
                
                // Project velocity to stay on ground plane
                let projectedVelocity = this.getDirectionTangentToSurface(velocity, obstructionUp);
                projectedVelocity = projectedVelocity.scale(velocity.length());
                
                // Remove any remaining component going into the wall
                const dot = Vector3.Dot(projectedVelocity, obstructionNormal);
                return projectedVelocity.subtract(obstructionNormal.scale(dot));
            }
        } else {
            if (isHitStable) {
                // Case 3: Airborne + Stable Hit (landing)
                // Remove vertical velocity, redirect horizontal along surface
                let horizontalVelocity = velocity.subtract(characterUp.scale(Vector3.Dot(velocity, characterUp)));
                const tangentDirection = this.getDirectionTangentToSurface(horizontalVelocity, hitNormal);
                return tangentDirection.scale(horizontalVelocity.length());
            } else {
                // Case 4: Airborne + Unstable Hit (wall in air)
                // Simple planar projection
                const dot = Vector3.Dot(velocity, hitNormal);
                return velocity.subtract(hitNormal.scale(dot));
            }
        }
    }

    // Interpolates simulation
    public update(velocity: Vector3, deltaTime: number): void {
        deltaTime = Math.min(deltaTime, 0.1);
        this.timeLeftOver += deltaTime;
        
        while (this.timeLeftOver >= this.fixedTimeStep) {
            this.previousPosition = this.transientPosition.clone();
            this.preSimulate();
            this.simulate(velocity, this.fixedTimeStep);
            this.timeLeftOver -= this.fixedTimeStep;
        }

        const alpha = this.timeLeftOver / this.fixedTimeStep;
        this.mesh.position = Vector3.Lerp(
            this.previousPosition,
            this.transientPosition,
            alpha
        );

        this.updateDebugUI();
    }
    
    private preSimulate(): void {
        this.lastGroundingStatus = { ...this.groundingStatus };
        this.groundingStatus = {
            isStableOnGround: false,
            foundAnyGround: false,
            groundNormal: Vector3.Up()
        };
        this.lastMovementIterationFoundAnyGround = false;
        this.probeGround();
    }
    
    private simulate(velocity: Vector3, deltaTime: number): void {
        // Detect landing and adjust velocity
        if (!this.lastGroundingStatus.isStableOnGround && this.groundingStatus.isStableOnGround) {
            // Just landed - remove vertical component and redirect along ground
            const characterUp = Vector3.Up();
            const horizontalVelocity = velocity.subtract(characterUp.scale(Vector3.Dot(velocity, characterUp)));
            const tangentDirection = this.getDirectionTangentToSurface(horizontalVelocity, this.groundingStatus.groundNormal);
            velocity = tangentDirection.scale(horizontalVelocity.length());
        }
        
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
                
                // Check if this hit is stable ground
                const isHitStable = this.isStableOnNormal(hit.normal);
                if (isHitStable) {
                    this.lastMovementIterationFoundAnyGround = true;
                }
                
                // Project velocity and update direction/magnitude
                const velocityBeforeProjection = remainingDirection.scale(remainingDistance / deltaTime);
                const projectedVelocity = this.handleVelocityProjection(velocityBeforeProjection, hit.normal);
                
                // Update remaining movement
                remainingDistance = projectedVelocity.length() * deltaTime;
                remainingDirection = projectedVelocity.lengthSquared() > 0 ? projectedVelocity.normalize() : remainingDirection;
            } else {
                currentPosition.addInPlace(remainingDirection.scale(remainingDistance));
                break;
            }
        }
        
        // Update simulated position
        this.transientPosition = currentPosition;
        
        // Re-probe ground after movement if we hit stable ground during movement
        // This ensures immediate grounding status update when landing
        if (this.lastMovementIterationFoundAnyGround && !this.groundingStatus.isStableOnGround) {
            this.probeGround();
        }
    }


    //  Updates the debug UI
    private updateDebugUI(): void {
        const grounded = this.groundingStatus.isStableOnGround ? "YES" : "NO";
        const groundedColor = this.groundingStatus.isStableOnGround ? "#00ff00" : "#ff0000";
        
        this.debugText.text = `Grounded: ${grounded}`;
        this.debugText.color = groundedColor;
    }


    // Get the current simulated position (not the visual mesh position)
    public getPosition(): Vector3 {
        return this.transientPosition.clone();
    }


    //Set the simulated position directly (bypasses interpolation for one frame)
    public setPosition(position: Vector3): void {
        this.transientPosition = position.clone();
        this.previousPosition = position.clone();
        this.mesh.position.copyFrom(position);
    }
}
