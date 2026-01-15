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
    KeyboardEventTypes,
    PointerEventTypes,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import HavokPhysics from '@babylonjs/havok';
import { PhysicsPlayer } from './players/PhysicsPlayer';
import { KinematicsPlayer } from './players/KinematicsPlayer';
import { ThirdPersonCamera } from './camera';
import { Painter } from './painting/painting';
import { Projectile } from './projectiles/projectile';

export async function createScene(engine: Engine): Promise<Scene> {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.5, 0.7, 1) as any;

    const envColor = new Color3(0.5, 0.7, 1);
    scene.clearColor = envColor as any;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = envColor;
    scene.fogStart = 50.0;
    scene.fogEnd = 150.0;

    const havokInstance = await HavokPhysics();
    const hk = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), hk);
    
    // Load environment
    await ImportMeshAsync("./city.glb", scene);
    
    // Enable anisotropic filtering for all textures
    scene.materials.forEach(material => {
        const textures = material.getActiveTextures();
        textures.forEach(texture => {
            texture.anisotropicFilteringLevel = 16;
        });
    });
    
    // Setup skybox
    const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
    const skyboxMaterial = new StandardMaterial("skyBox", scene);
    skyboxMaterial.fogEnabled = false;
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.disableLighting = true;
    skyboxMaterial.reflectionTexture = new CubeTexture("/skybox/skybox", scene, ["_px.png", "_py.png", "_pz.png", "_nx.png", "_ny.png", "_nz.png"]);
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.reflectionTexture.level = 2.5;
    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
    skybox.renderingGroupId = 0;
    skybox.isPickable = false;

    // Lighting
    scene.createDefaultEnvironment({
        createGround: false,
        createSkybox: false
    });
    scene.environmentIntensity = 0.3;
    
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.3;
    
    const dirLight = new DirectionalLight("dirLight", new Vector3(1, -0.7, 1), scene);
    dirLight.position = new Vector3(0, 200, 0);
    dirLight.intensity = 2.5;

    // Setup physics
    scene.meshes.forEach(mesh => {
        if (mesh.name === 'skyBox') return;
        
        if (mesh.getTotalVertices() === 0) {
            mesh.isPickable = true;
            mesh.layerMask = 0x0FFFFFFF;
            console.log(`Skipping physics for mesh: ${mesh.name}`);
            return;
        }
        
        new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0, friction: 0.5, restitution: 0 }, scene);
        mesh.checkCollisions = true;
        mesh.isPickable = true;
        mesh.layerMask = 0x0FFFFFFF;
        mesh.refreshBoundingInfo(false, false);
    });

    // Setup player
    const USE_KINEMATIC = false;
    let player: PhysicsPlayer | KinematicsPlayer;
    
    if (USE_KINEMATIC) {
        player = new KinematicsPlayer(scene, 10);
    } else {
        player = new PhysicsPlayer(scene, 10);
    }

    // Setup camera
    const canvas = engine.getRenderingCanvas()!;
    const thirdPersonCamera = new ThirdPersonCamera(scene, player, canvas);
    scene.activeCamera = thirdPersonCamera.getCamera();

    // Setup painting
    let painter = new Painter(scene, 1.3);

    // Input handling
    const inputMap: { [key: string]: boolean } = {};
    
    // Shooting state
    let isMouseDown = false;
    let lastFireTime = 0;
    const fireRate = 100; // milliseconds between shots
    
    // Click handling for shooting
    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
            isMouseDown = true;
        } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
            isMouseDown = false;
        }
    });
    
    scene.onKeyboardObservable.add((kbInfo) => {
        const key = kbInfo.event.key.toLowerCase();
        if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
            inputMap[key] = true;
        } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
            inputMap[key] = false;
        }
    });

    // Main update loop
    scene.onBeforeRenderObservable.add(() => {
        thirdPersonCamera.update();
        player.update();

        // Handle continuous shooting
        if (isMouseDown) {
            const currentTime = Date.now();
            if (currentTime - lastFireTime >= fireRate) {
                lastFireTime = currentTime;
                
                // 1. Raycast from camera center to find what we're looking at
                const aimRay = thirdPersonCamera.getAimRay();
                
                const hit = scene.pickWithRay(aimRay, (mesh) => {
                    // Ignore player and previous projectiles
                    return mesh.name !== "player" && 
                           mesh.name !== "projectile" && 
                           mesh.isPickable && 
                           mesh.isVisible;
                });

                let targetPoint: Vector3;
                if (hit && hit.hit && hit.pickedPoint) {
                    targetPoint = hit.pickedPoint;
                } else {
                    // If sky/nothing, shoot towards infinity along camera dir
                    targetPoint = aimRay.origin.add(aimRay.direction.scale(1000));
                }
                
                // 2. Calculate direction from player's weapon position
                const playerPos = player.position.clone();
                playerPos.y += 0.8; // Approximate chest/weapon height
                
                let direction = targetPoint.subtract(playerPos).normalize();
                
                // 3. Prevent shooting backwards
                // If the target is behind the player (e.g. obstruction between camera and player),
                // the dot product between shoot direction and camera view direction will be negative.
                const cameraDir = aimRay.direction;
                if (Vector3.Dot(direction, cameraDir) < 0.2) {
                    // Fallback: just shoot straight forward relative to camera
                    direction = cameraDir;
                }
                
                // Move spawn point slightly forward to avoid colliding with player's own collider
                const spawnPos = playerPos.add(direction.scale(1.0));

                // Random speed for spray effect (some fall short, some go far)
                const speed = 15 + Math.random() * 45; 

                // Fire projectile
                new Projectile(scene, spawnPos, direction, speed, painter);
            }
        }

        let inputDir = new Vector3(0, 0, 0);
        const forward = thirdPersonCamera.getForwardDirection();
        const right = thirdPersonCamera.getRightDirection();
        
        if (inputMap["w"]) inputDir.addInPlace(forward);
        if (inputMap["s"]) inputDir.addInPlace(forward.scale(-1));
        if (inputMap["a"]) inputDir.addInPlace(right.scale(-1));
        if (inputMap["d"]) inputDir.addInPlace(right);
        
        if (inputDir.length() > 0) {
            inputDir.normalize();
        }
        
        if (player instanceof KinematicsPlayer) {
            const deltaTime = engine.getDeltaTime() / 1000;
            player.move(inputDir, deltaTime);
        } else {
            player.move(inputDir);
        }
    });

    // FPS display
    const fpsText = document.getElementById("fps-box")!;
    setInterval(() => {
        fpsText.innerText = `${scene.getEngine().getFps().toFixed(0)} fps`;
    }, 100);
    (window as any).scene = scene;

    return scene;
}
