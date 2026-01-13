import { 
    Scene, 
    UniversalCamera, 
    Vector3, 
    Ray,
    AbstractMesh
} from '@babylonjs/core';
import { PhysicsPlayer } from './players/PhysicsPlayer';
import { KinematicsPlayer } from './players/KinematicsPlayer';

export class ThirdPersonCamera {
    private camera: UniversalCamera;
    private player: PhysicsPlayer | KinematicsPlayer;
    private scene: Scene;
    private yaw: number = 0;
    private pitch: number = 0.5;
    private baseDistance: number = 8;
    private distance: number = 8;
    private currentDistance: number = 8;
    private mouseSensitivity: number = 0.0018;
    private isPointerLocked: boolean = false;
    private targetYaw: number = 0;
    private targetPitch: number = 0.5;
    private smoothedPlayerPos: Vector3 = Vector3.Zero();
    private followSmoothness: number = 0.15;
    private shoulderOffset: number = 1.9;
    private heightOffset: number = 1;

    constructor(scene: Scene, player: PhysicsPlayer | KinematicsPlayer, canvas: HTMLCanvasElement) {
        this.scene = scene;
        this.player = player;
        this.smoothedPlayerPos = player.position.clone();
        
        const playerScale = player.mesh.scaling.x;
        this.distance = this.baseDistance * playerScale;
        this.currentDistance = this.distance;
        
        this.camera = new UniversalCamera("thirdPersonCamera", new Vector3(0, 5, -10), scene);
        this.camera.attachControl(canvas, false);
        this.camera.inputs.clear();
        this.camera.minZ = 0.1;
        this.camera.maxZ = 1000;
        this.setupPointerLock(canvas);
        this.setupMouseControls(canvas);
    }

    private setupPointerLock(canvas: HTMLCanvasElement): void {
        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
        });
    }

    private setupMouseControls(canvas: HTMLCanvasElement): void {
        canvas.addEventListener('mousemove', (event) => {
            if (!this.isPointerLocked) return;

            this.targetYaw += event.movementX * this.mouseSensitivity;
            this.targetPitch += event.movementY * this.mouseSensitivity;
            this.targetPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 2.5, this.targetPitch));
        });

        // Mouse wheel for zoom
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const playerScale = this.player.mesh.scaling.x;
            this.distance += event.deltaY * 0.01;
            this.distance = Math.max(3 * playerScale, Math.min(15 * playerScale, this.distance));
        });
    }

    public update(): void {
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
        
        const rotationSmoothness = 0.5;
        const rotationFactor = 1 - Math.pow(1 - rotationSmoothness, deltaTime * 60);
        this.yaw += (this.targetYaw - this.yaw) * rotationFactor;
        this.pitch += (this.targetPitch - this.pitch) * rotationFactor;

        const followFactor = 1 - Math.pow(1 - this.followSmoothness, deltaTime * 60);
        const playerPos = this.player.position;
        this.smoothedPlayerPos.x += (playerPos.x - this.smoothedPlayerPos.x) * followFactor;
        this.smoothedPlayerPos.y += (playerPos.y - this.smoothedPlayerPos.y) * followFactor;
        this.smoothedPlayerPos.z += (playerPos.z - this.smoothedPlayerPos.z) * followFactor;

        const playerScale = this.player.mesh.scaling.x;
        const lookTarget = this.smoothedPlayerPos.add(new Vector3(0, (0.45 + this.heightOffset) * playerScale, 0));

        const horizontalOffset = this.distance * Math.cos(this.pitch);
        const desiredX = lookTarget.x - horizontalOffset * Math.sin(this.yaw);
        const desiredY = lookTarget.y + this.distance * Math.sin(this.pitch);
        const desiredZ = lookTarget.z - horizontalOffset * Math.cos(this.yaw);
        
        let desiredPosition = new Vector3(desiredX, desiredY, desiredZ);

        const rightVector = this.getRightDirection();
        const shoulderOffsetVec = rightVector.scale(this.shoulderOffset * playerScale);
        desiredPosition = desiredPosition.add(shoulderOffsetVec);
        
        const offsetLookTarget = lookTarget.add(shoulderOffsetVec.scale(0.3));

        const direction = desiredPosition.subtract(offsetLookTarget);
        const rayLength = direction.length();
        const ray = new Ray(lookTarget, direction.normalize(), rayLength);
        
        const hit = this.scene.pickWithRay(ray, (mesh: AbstractMesh) => {
            if (mesh.name === "player" || mesh.name === "skyBox" || mesh.name.startsWith("debug")) {
                return false;
            }
            const metadata = mesh.metadata;
            if (metadata && metadata.cameraCollision === false) {
                return false;
            }
            return true;
        }, false);

        let targetDistance: number;
        if (hit?.hit && hit.distance < rayLength) {
            targetDistance = Math.max(0.5, hit.distance - 0.3);
        } else {
            targetDistance = rayLength;
        }

        const isCompressing = targetDistance < this.currentDistance;
        const rawSmoothFactor = isCompressing ? 1.0 : 0.08;
        const smoothFactor = isCompressing ? 1.0 : (1 - Math.pow(1 - rawSmoothFactor, deltaTime * 60));
        this.currentDistance += (targetDistance - this.currentDistance) * smoothFactor;

        const normalizedDirection = direction.normalize();
        const finalPosition = offsetLookTarget.add(normalizedDirection.scale(this.currentDistance));

        this.camera.position = finalPosition;

        this.camera.setTarget(offsetLookTarget);

        const cameraToLookTarget = offsetLookTarget.subtract(finalPosition);
        const checkRay = new Ray(finalPosition, cameraToLookTarget.normalize(), cameraToLookTarget.length());
        const viewBlockCheck = this.scene.pickWithRay(checkRay, (mesh: AbstractMesh) => {
            return mesh.name === "player";
        });

        this.player.setTransparency(viewBlockCheck?.hit === true);
    }

    public getForwardDirection(): Vector3 {
        // Get the actual direction the camera is looking at (accounting for shoulder offset)
        const forward = this.camera.getDirection(Vector3.Forward());
        // Project onto horizontal plane (ignore Y component)
        return new Vector3(forward.x, 0, forward.z).normalize();
    }

    public getRightDirection(): Vector3 {
        // Get the actual right direction of the camera
        const right = this.camera.getDirection(Vector3.Right());
        // Project onto horizontal plane (ignore Y component)
        return new Vector3(right.x, 0, right.z).normalize();
    }

    public getCamera(): UniversalCamera {
        return this.camera;
    }

    public getAimRay(): Ray {
        return this.camera.getForwardRay(10000);
    }

    public getAimDirection(): Vector3 {
        return this.camera.getDirection(Vector3.Forward());
    }
}
