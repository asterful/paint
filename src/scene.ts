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
    ShadowGenerator,
    ImportMeshAsync,
    RenderTargetTexture,
    CubeTexture,
    MeshBuilder,
    StandardMaterial,
    Texture
} from '@babylonjs/core';
import '@babylonjs/loaders';
import HavokPhysics from '@babylonjs/havok';
import { Player } from './player';
import { ThirdPersonCamera } from './camera';

export async function createScene(engine: Engine): Promise<Scene> {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.5, 0.7, 1) as any;

    const havokInstance = await HavokPhysics();
    const hk = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), hk);  // Enable gravity
    
    // Load city from Blender
    await ImportMeshAsync("./city.glb", scene);
    
    // Manual skybox creation
    const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
    const skyboxMaterial = new StandardMaterial("skyBox", scene);
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.disableLighting = true;
    skyboxMaterial.reflectionTexture = new CubeTexture("/skybox/skybox", scene, ["_px.png", "_py.png", "_pz.png", "_nx.png", "_ny.png", "_nz.png"]);
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.reflectionTexture.level = 2.5;  // Increase brightness (default is 1.0)
    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
    skybox.renderingGroupId = 0;
    skybox.isPickable = false;  // Skybox should not block camera

    // Environment lighting for PBR materials
    scene.createDefaultEnvironment({
        createGround: false,
        createSkybox: false
    });
    scene.environmentIntensity = 0.3;
    
    // Lighting setup
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.3;
    
    // Directional light for shadows - like late afternoon sun
    // Direction: where light rays point (normalized automatically)
    // Position: where shadow camera is placed (must be above your scene)
    const dirLight = new DirectionalLight("dirLight", new Vector3(1, -0.7, 1), scene);
    dirLight.position = new Vector3(0, 200, 0);  // High above scene center
    dirLight.intensity = 2.5;
    dirLight.autoUpdateExtends = false;  // Freeze shadow position for static world

    // Static shadow generator for environment
    const staticShadowGenerator = new ShadowGenerator(8192, dirLight);
    staticShadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    staticShadowGenerator.setDarkness(0);
    staticShadowGenerator.bias = 0.0005;
    staticShadowGenerator.getShadowMap()!.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    staticShadowGenerator.useContactHardeningShadow = true;

    // Add physics to all imported meshes
    scene.meshes.forEach(mesh => {
        if (mesh.name === 'player') return;
        if (mesh.name === 'skyBox') return;  // Skip skybox
        if (mesh.metadata?.physics === 'none') return;
        
        // Skip meshes without geometry
        if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) {
            // Still set pickable for parent meshes to ensure raycasts work
            mesh.isPickable = true;
            mesh.layerMask = 0x0FFFFFFF;
            return;
        }
        
        // Create new material and copy texture from old material
        if (mesh.material) {
            const oldMat = mesh.material as PBRMaterial;
            const newMat = new PBRMaterial(mesh.name + "_mat", scene);
            
            // Copy texture from old material
            if (oldMat.albedoTexture) {
                newMat.albedoTexture = oldMat.albedoTexture;
            }
            
            // Set material properties
            newMat.metallic = 0;
            newMat.roughness = 0.7;
            
            // Assign new material to mesh
            mesh.material = newMat;
        }
        
        // Force flat shading by disabling smooth normals
        if ('convertToFlatShadedMesh' in mesh) {
            (mesh as any).convertToFlatShadedMesh();
        }
        
        new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0, friction: 0.5, restitution: 0 }, scene);
        mesh.checkCollisions = true;
        mesh.receiveShadows = true;
        mesh.isPickable = true;  // Enable raycasting for camera collision
        mesh.layerMask = 0x0FFFFFFF;  // Ensure mesh is on the main layer (not debug layer)
        mesh.refreshBoundingInfo(false, false);  // Update bounding info for accurate raycasts
        staticShadowGenerator.addShadowCaster(mesh);
    });

    const player = new Player(scene);
    // Player doesn't cast shadows - only receives them from static environment

    const canvas = engine.getRenderingCanvas()!;
    const thirdPersonCamera = new ThirdPersonCamera(scene, player, canvas);
    scene.activeCamera = thirdPersonCamera.getCamera();

    const fpsText = document.getElementById("fps-box")!;
    const debugText = document.getElementById("debug-box")!;

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

    scene.onBeforeRenderObservable.add(() => {
        thirdPersonCamera.update();
        player.update();

        const speed = 7.5;
        const vel = player.body.getLinearVelocity();
        let inputDir = new Vector3(0, 0, 0);
        
        const forward = thirdPersonCamera.getForwardDirection();
        const right = thirdPersonCamera.getRightDirection();
        
        if (inputMap["w"]) inputDir.addInPlace(forward);
        if (inputMap["s"]) inputDir.addInPlace(forward.scale(-1));
        if (inputMap["a"]) inputDir.addInPlace(right.scale(-1));
        if (inputMap["d"]) inputDir.addInPlace(right);
        
        if (inputDir.length() > 0) {
            inputDir.normalize();
            inputDir.scaleInPlace(speed);
        }
        
        // Preserve vertical velocity from physics (gravity) to avoid bouncing
        player.body.setLinearVelocity(new Vector3(inputDir.x, vel.y, inputDir.z));
        
        // Update debug info
        const pos = player.mesh.position;
        const normalizedForward = forward.normalize();
        debugText.innerHTML = `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})<br>` +
                              `Forward: (${normalizedForward.x.toFixed(2)}, ${normalizedForward.y.toFixed(2)}, ${normalizedForward.z.toFixed(2)})<br>` +
                              `Inverted: (${(-normalizedForward.x).toFixed(2)}, ${(-normalizedForward.y).toFixed(2)}, ${(-normalizedForward.z).toFixed(2)})`;
    });

    setInterval(() => {
        fpsText.innerText = `${scene.getEngine().getFps().toFixed(0)} fps`;
    }, 100);

    return scene;
}
