import { 
    Scene, 
    UniversalCamera, 
    Vector3, 
    Ray,
    Mesh,
    AbstractMesh,
    FreeCamera,
    MeshBuilder,
    StandardMaterial,
    Color3,
    LinesMesh,
    Viewport
} from '@babylonjs/core';
import { Player } from './player';

export class ThirdPersonCamera {
    private camera: UniversalCamera;
    private debugCamera!: FreeCamera;
    private debugCameraMarker!: Mesh;
    private debugLookLine!: LinesMesh;
    private debugRaycastLine!: LinesMesh;
    private debugTargetMarker!: Mesh;
    private player: Player;
    private scene: Scene;
    private yaw: number = 0;
    private pitch: number = 0.5;
    private baseDistance: number = 8;
    private baseHeight: number = 3;
    private distance: number = 8;
    private currentDistance: number = 8;
    private height: number = 3;
    private mouseSensitivity: number = 0.003;
    private isPointerLocked: boolean = false;
    private targetYaw: number = 0;
    private targetPitch: number = 0.5;
    private smoothedPlayerPos: Vector3 = Vector3.Zero();
    private followSmoothness: number = 0.15; // Adjust for more/less smoothness (lower = smoother)

    constructor(scene: Scene, player: Player, canvas: HTMLCanvasElement) {
        this.scene = scene;
        this.player = player;
        this.smoothedPlayerPos = player.position.clone();
        
        // Auto-adjust camera based on player scale
        const playerScale = player.mesh.scaling.x;
        this.distance = this.baseDistance * playerScale;
        this.currentDistance = this.distance;
        this.height = this.baseHeight * playerScale;
        
        this.camera = new UniversalCamera("thirdPersonCamera", new Vector3(0, 5, -10), scene);
        this.camera.attachControl(canvas, false);
        this.camera.inputs.clear();
        this.camera.layerMask = 0x0FFFFFFF; // See everything except debug layer
        
        // Reduce near clipping plane to minimum (but not 0!)
        this.camera.minZ = 0.01; // Small value to avoid clipping issues
        this.camera.maxZ = 1000; // Optional: extend far plane
        
        this.setupDebugCamera();
        this.setupPointerLock(canvas);
        this.setupMouseControls(canvas);
    }

    private setupDebugCamera(): void {
        // Create debug camera with fixed position viewing from the side
        this.debugCamera = new FreeCamera("debugCamera", new Vector3(15, 10, 0), this.scene);
        this.debugCamera.setTarget(Vector3.Zero());
        this.debugCamera.layerMask = 0xFFFFFFFF; // See everything including debug layer
        
        // Set viewport to top-right corner (20% width, 20% height)
        this.debugCamera.viewport = new Viewport(0.78, 0.78, 0.22, 0.22);
        
        // Add to active cameras
        this.scene.activeCameras = [this.camera, this.debugCamera];
        
        // Create a small sphere to represent the main camera position
        this.debugCameraMarker = MeshBuilder.CreateSphere("debugCameraMarker", { diameter: 0.5 }, this.scene);
        const markerMat = new StandardMaterial("debugCameraMarkerMat", this.scene);
        markerMat.diffuseColor = new Color3(1, 0, 0);
        markerMat.emissiveColor = new Color3(0.5, 0, 0);
        this.debugCameraMarker.material = markerMat;
        this.debugCameraMarker.layerMask = 0x10000000; // Debug layer
        
        // Create line to show where camera is looking
        this.debugLookLine = MeshBuilder.CreateLines("debugLookLine", {
            points: [Vector3.Zero(), Vector3.Zero()]
        }, this.scene);
        this.debugLookLine.color = new Color3(1, 1, 0);
        this.debugLookLine.layerMask = 0x10000000; // Debug layer
        
        // Create line to show camera raycast
        this.debugRaycastLine = MeshBuilder.CreateLines("debugRaycastLine", {
            points: [Vector3.Zero(), Vector3.Zero()]
        }, this.scene);
        this.debugRaycastLine.color = new Color3(0, 1, 1); // Cyan
        this.debugRaycastLine.isPickable = false;
        
        // Make the raycast line thicker and always visible
        const raycastTube = MeshBuilder.CreateTube("debugRaycastTube", {
            path: [Vector3.Zero(), new Vector3(0, 0.01, 0)],
            radius: 0.05,
            updatable: true
        }, this.scene);
        const raycastMat = new StandardMaterial("debugRaycastMat", this.scene);
        raycastMat.diffuseColor = new Color3(0, 1, 1);
        raycastMat.emissiveColor = new Color3(0, 0.5, 0.5);
        raycastTube.material = raycastMat;
        raycastTube.isPickable = false;
        raycastTube.layerMask = 0x10000000; // Debug layer
        this.debugRaycastLine = raycastTube as any;
        
        // Create small sphere to show look target
        this.debugTargetMarker = MeshBuilder.CreateSphere("debugTargetMarker", { diameter: 0.3 }, this.scene);
        const targetMat = new StandardMaterial("debugTargetMarkerMat", this.scene);
        targetMat.diffuseColor = new Color3(1, 1, 0);
        targetMat.emissiveColor = new Color3(0.5, 0.5, 0);
        this.debugTargetMarker.material = targetMat;
        this.debugTargetMarker.layerMask = 0x10000000; // Debug layer
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
            
            // Clamp pitch
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
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000; // Convert to seconds
        
        // Framerate independent smooth camera rotation
        const rotationSmoothness = 0.5;
        const rotationFactor = 1 - Math.pow(1 - rotationSmoothness, deltaTime * 60);
        this.yaw += (this.targetYaw - this.yaw) * rotationFactor;
        this.pitch += (this.targetPitch - this.pitch) * rotationFactor;

        // Framerate independent smooth camera follow
        const followFactor = 1 - Math.pow(1 - this.followSmoothness, deltaTime * 60);
        const playerPos = this.player.position;
        this.smoothedPlayerPos.x += (playerPos.x - this.smoothedPlayerPos.x) * followFactor;
        this.smoothedPlayerPos.y += (playerPos.y - this.smoothedPlayerPos.y) * followFactor;
        this.smoothedPlayerPos.z += (playerPos.z - this.smoothedPlayerPos.z) * followFactor;

        // Look target is at the head - this is what we orbit around
        const playerScale = this.player.mesh.scaling.x;
        const lookTarget = this.smoothedPlayerPos.add(new Vector3(0, 0.45 * playerScale, 0));

        // Calculate desired camera position with full distance - ORBIT AROUND LOOK TARGET
        const horizontalOffset = this.distance * Math.cos(this.pitch);
        const desiredX = lookTarget.x - horizontalOffset * Math.sin(this.yaw);
        const desiredY = lookTarget.y + this.distance * Math.sin(this.pitch);
        const desiredZ = lookTarget.z - horizontalOffset * Math.cos(this.yaw);
        
        const desiredPosition = new Vector3(desiredX, desiredY, desiredZ);

        // Camera collision detection - raycast from LOOK TARGET to desired camera position
        const direction = desiredPosition.subtract(lookTarget);
        const rayLength = direction.length();
        const ray = new Ray(lookTarget, direction.normalize(), rayLength);
        
        const hit = this.scene.pickWithRay(ray, (mesh: AbstractMesh) => {
            // Check if mesh should block camera
            // Skip: player, skybox, debug objects, and meshes tagged as "cameraIgnore"
            if (mesh.name === "player" || mesh.name === "skyBox" || mesh.name.startsWith("debug")) {
                return false;
            }
            // Check for cameraCollision metadata (default to true if not set)
            const metadata = mesh.metadata;
            if (metadata && metadata.cameraCollision === false) {
                return false;
            }
            return true;
        }, false);

        // Calculate target distance based on collision
        let targetDistance: number;
        if (hit?.hit && hit.distance < rayLength) {
            // Compress distance when hitting obstacle
            targetDistance = Math.max(0.5, hit.distance - 0.3);
        } else {
            // Use full distance when clear
            targetDistance = rayLength;
        }

        // Instant compression when moving in, smooth extension when moving out
        const isCompressing = targetDistance < this.currentDistance;
        const rawSmoothFactor = isCompressing ? 1.0 : 0.08;
        const smoothFactor = isCompressing ? 1.0 : (1 - Math.pow(1 - rawSmoothFactor, deltaTime * 60));
        this.currentDistance += (targetDistance - this.currentDistance) * smoothFactor;

        // Calculate final position using smoothed distance - ORBIT AROUND LOOK TARGET
        const normalizedDirection = direction.normalize();
        const finalPosition = lookTarget.add(normalizedDirection.scale(this.currentDistance));

        this.camera.position = finalPosition;

        this.camera.setTarget(lookTarget);

        // Check if player is blocking the camera view
        const cameraToLookTarget = lookTarget.subtract(finalPosition);
        const checkRay = new Ray(finalPosition, cameraToLookTarget.normalize(), cameraToLookTarget.length());
        const viewBlockCheck = this.scene.pickWithRay(checkRay, (mesh: AbstractMesh) => {
            return mesh.name === "player";
        });

        // Make player transparent if blocking view
        this.player.setTransparency(viewBlockCheck?.hit === true);
        
        // Update debug camera visualizations
        this.updateDebugCamera(finalPosition, lookTarget, lookTarget, desiredPosition);
    }
    
    private updateDebugCamera(cameraPosition: Vector3, lookTarget: Vector3, rayStart: Vector3, rayEnd: Vector3): void {
        // Update camera marker position
        this.debugCameraMarker.position = cameraPosition;
        
        // Update look line
        this.debugLookLine = MeshBuilder.CreateLines("debugLookLine", {
            points: [cameraPosition, lookTarget],
            instance: this.debugLookLine
        }, this.scene);
        
        // Update raycast line (player to desired camera position)
        this.debugRaycastLine = MeshBuilder.CreateTube("debugRaycastTube", {
            path: [rayStart, rayEnd],
            radius: 0.05,
            instance: this.debugRaycastLine as any
        }, this.scene) as any;
        
        // Update target marker position
        this.debugTargetMarker.position = lookTarget;
        
        // Keep debug camera looking at the player
        const playerPos = this.player.position;
        this.debugCamera.setTarget(playerPos);
    }

    public getForwardDirection(): Vector3 {
        // Get forward direction based on camera yaw (ignoring pitch for movement)
        return new Vector3(
            Math.sin(this.yaw),
            0,
            Math.cos(this.yaw)
        ).normalize();
    }

    public getRightDirection(): Vector3 {
        // Get right direction based on camera yaw
        return new Vector3(
            Math.cos(this.yaw),
            0,
            -Math.sin(this.yaw)
        ).normalize();
    }

    public getCamera(): UniversalCamera {
        return this.camera;
    }
}
