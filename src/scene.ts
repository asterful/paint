import {
    Scene,
    Engine,
    HemisphericLight,
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
    HavokPlugin,
    ActionManager,
    ExecuteCodeAction,
    Color3,
    PBRMaterial,
    DirectionalLight,
    ImportMeshAsync,
    CubeTexture,
    MeshBuilder,
    StandardMaterial,
    Texture
} from '@babylonjs/core';
import '@babylonjs/loaders';
import HavokPhysics from '@babylonjs/havok';
import { PhysicsPlayer } from './players/PhysicsPlayer';
import { KinematicsPlayer } from './players/KinematicsPlayer';
import { ThirdPersonCamera } from './camera';

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

    // Lighting and shadows
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
        if (mesh.name === 'player') return;
        if (mesh.name === 'skyBox') return;
        
        if (mesh.getTotalVertices() === 0) {
            mesh.isPickable = true;
            mesh.layerMask = 0x0FFFFFFF;
            console.log(`Skipping physics for mesh: ${mesh.name}`);
            return;
        }
        
        if (mesh.material) {
            const oldMat = mesh.material as PBRMaterial;
            const newMat = new PBRMaterial(mesh.name + "_mat", scene);
            
            if (oldMat.albedoTexture) {
                newMat.albedoTexture = oldMat.albedoTexture;
                // Enable anisotropic filtering for sharper textures at oblique angles
                if (oldMat.albedoTexture.anisotropicFilteringLevel !== undefined) {
                    oldMat.albedoTexture.anisotropicFilteringLevel = 16;
                }
            }
            
            newMat.metallic = 0;
            newMat.roughness = 0.7;
            mesh.material = newMat;
        }
        
        if ('convertToFlatShadedMesh' in mesh) {
            (mesh as any).convertToFlatShadedMesh();
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

    // Input handling
    const inputMap: { [key: string]: boolean } = {};
    scene.actionManager = new ActionManager(scene);
    scene.actionManager.registerAction(
        new ExecuteCodeAction(
            ActionManager.OnKeyDownTrigger,
            (evt) => (inputMap[evt.sourceEvent.key.toLowerCase()] = true)
        )
    );
    scene.actionManager.registerAction(
        new ExecuteCodeAction(
            ActionManager.OnKeyUpTrigger,
            (evt) => (inputMap[evt.sourceEvent.key.toLowerCase()] = false)
        )
    );

    // Main update loop
    scene.onBeforeRenderObservable.add(() => {
        thirdPersonCamera.update();
        player.update();

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
