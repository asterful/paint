import {
    Scene,
    Engine,
    HemisphericLight,
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
    HavokPlugin,
    Color3,
    DirectionalLight,
    ImportMeshAsync,
    CubeTexture,
    MeshBuilder,
    StandardMaterial,
    Texture,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import HavokPhysics from '@babylonjs/havok';
import { PhysicsPlayer } from '../entities/PhysicsPlayer';
import { KinematicsPlayer } from '../entities/KinematicsPlayer';
import { ThirdPersonCamera } from '../systems/camera/ThirdPersonCamera';
import { PaintSystem } from '../systems/paint/PaintSystem';
import { ProjectileSystem } from '../systems/projectiles/ProjectileSystem';
import { InputSystem } from '../systems/input/InputSystem';

/**
 * MainLevel scene - the primary gameplay scene
 * Coordinates all systems and entities
 */
export class MainLevel {
    private engine: Engine;
    private scene!: Scene;
    private player!: PhysicsPlayer | KinematicsPlayer;
    private camera!: ThirdPersonCamera;
    private paintSystem!: PaintSystem;
    private projectileSystem!: ProjectileSystem;
    private inputSystem!: InputSystem;

    // Shooting state
    private lastFireTime: number = 0;
    private readonly fireRate: number = 100; // milliseconds between shots

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public async initialize(): Promise<Scene> {
        this.scene = new Scene(this.engine);
        
        await this.setupEnvironment();
        await this.setupPhysics();
        await this.loadWorld();
        this.setupPlayer();
        this.setupCamera();
        this.setupSystems();
        this.setupGameLoop();
        this.setupUI();

        return this.scene;
    }

    private async setupEnvironment(): Promise<void> {
        const envColor = new Color3(0.5, 0.7, 1);
        this.scene.clearColor = envColor as any;
        this.scene.fogMode = Scene.FOGMODE_LINEAR;
        this.scene.fogColor = envColor;
        this.scene.fogStart = 50.0;
        this.scene.fogEnd = 150.0;

        // Lighting
        this.scene.createDefaultEnvironment({
            createGround: false,
            createSkybox: false
        });
        this.scene.environmentIntensity = 0.3;

        const light = new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.3;

        const dirLight = new DirectionalLight("dirLight", new Vector3(1, -0.7, 1), this.scene);
        dirLight.position = new Vector3(0, 200, 0);
        dirLight.intensity = 2.5;

        // Setup skybox
        const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, this.scene);
        const skyboxMaterial = new StandardMaterial("skyBox", this.scene);
        skyboxMaterial.fogEnabled = false;
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.disableLighting = true;
        skyboxMaterial.reflectionTexture = new CubeTexture(
            "/skybox/skybox",
            this.scene,
            ["_px.png", "_py.png", "_pz.png", "_nx.png", "_ny.png", "_nz.png"]
        );
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.reflectionTexture.level = 2.5;
        skybox.material = skyboxMaterial;
        skybox.infiniteDistance = true;
        skybox.renderingGroupId = 0;
        skybox.isPickable = false;
    }

    private async setupPhysics(): Promise<void> {
        const havokInstance = await HavokPhysics();
        const hk = new HavokPlugin(true, havokInstance);
        this.scene.enablePhysics(new Vector3(0, -9.81, 0), hk);
    }

    private async loadWorld(): Promise<void> {
        await ImportMeshAsync("./city.glb", this.scene);

        // Enable anisotropic filtering for all textures
        this.scene.materials.forEach(material => {
            const textures = material.getActiveTextures();
            textures.forEach(texture => {
                texture.anisotropicFilteringLevel = 16;
            });
        });

        // Setup physics for all meshes
        this.scene.meshes.forEach(mesh => {
            if (mesh.name === 'skyBox') return;

            if (mesh.getTotalVertices() === 0) {
                mesh.isPickable = true;
                mesh.layerMask = 0x0FFFFFFF;
                console.log(`Skipping physics for mesh: ${mesh.name}`);
                return;
            }

            new PhysicsAggregate(
                mesh,
                PhysicsShapeType.MESH,
                { mass: 0, friction: 0.5, restitution: 0 },
                this.scene
            );
            mesh.checkCollisions = true;
            mesh.isPickable = true;
            mesh.layerMask = 0x0FFFFFFF;
            mesh.refreshBoundingInfo(false, false);
        });
    }

    private setupPlayer(): void {
        const USE_KINEMATIC = false;

        if (USE_KINEMATIC) {
            this.player = new KinematicsPlayer(this.scene, 10);
        } else {
            this.player = new PhysicsPlayer(this.scene, 10);
        }
    }

    private setupCamera(): void {
        const canvas = this.engine.getRenderingCanvas()!;
        this.camera = new ThirdPersonCamera(this.scene, this.player, canvas);
        this.scene.activeCamera = this.camera.getCamera();
    }

    private setupSystems(): void {
        // Initialize systems
        this.paintSystem = new PaintSystem(this.scene, 1.3);
        this.projectileSystem = new ProjectileSystem(this.scene);
        this.inputSystem = new InputSystem(this.scene, this.camera);

        // Connect projectile system to paint system
        this.projectileSystem.setHitCallback((pickInfo) => {
            this.paintSystem.paintAtPickInfo(pickInfo);
        });
    }

    private setupGameLoop(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            this.update();
        });
    }

    private update(): void {
        const deltaTime = this.engine.getDeltaTime() / 1000;

        // Update camera
        this.camera.update();

        // Get input state
        const input = this.inputSystem.getInputState();

        // Update player
        if (this.player instanceof KinematicsPlayer) {
            this.player.move(input.movement, deltaTime);
        } else {
            this.player.move(input.movement);
        }
        this.player.update();

        // Handle shooting
        if (input.isMouseDown) {
            this.handleShooting();
        }
    }

    private handleShooting(): void {
        const currentTime = Date.now();
        if (currentTime - this.lastFireTime < this.fireRate) {
            return;
        }
        this.lastFireTime = currentTime;

        // 1. Raycast from camera center to find what we're looking at
        const aimRay = this.camera.getAimRay();

        const hit = this.scene.pickWithRay(aimRay, (mesh) => {
            return mesh.name !== "player" && 
                   mesh.name !== "projectile" && 
                   mesh.isPickable && 
                   mesh.isVisible;
        });

        let targetPoint: Vector3;
        if (hit && hit.hit && hit.pickedPoint) {
            targetPoint = hit.pickedPoint;
        } else {
            targetPoint = aimRay.origin.add(aimRay.direction.scale(1000));
        }

        // 2. Calculate direction from player's weapon position
        const playerPos = this.player.position.clone();
        playerPos.y += 0.8; // Approximate chest/weapon height

        let direction = targetPoint.subtract(playerPos).normalize();

        // 3. Prevent shooting backwards
        const cameraDir = aimRay.direction;
        if (Vector3.Dot(direction, cameraDir) < 0.2) {
            direction = cameraDir;
        }

        // Move spawn point slightly forward to avoid colliding with player's own collider
        const spawnPos = playerPos.add(direction.scale(1.0));

        // Random speed for spray effect
        const speed = 15 + Math.random() * 45;

        // Fire projectile
        this.projectileSystem.spawnProjectile(spawnPos, direction, speed);
    }

    private setupUI(): void {
        // FPS display
        const fpsText = document.getElementById("fps-box");
        if (fpsText) {
            setInterval(() => {
                fpsText.innerText = `${this.scene.getEngine().getFps().toFixed(0)} fps`;
            }, 100);
        }

        // Expose scene for debugging
        (window as any).scene = this.scene;
    }
}
