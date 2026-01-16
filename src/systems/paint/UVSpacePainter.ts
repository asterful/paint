import {
    RenderTargetTexture,
    ShaderMaterial,
    Effect,
    Vector3,
    Color4,
    Scene,
    AbstractMesh,
    Engine,
    PostProcess,
    Constants
} from '@babylonjs/core';
import uvSpacePaintVertex from './shaders/uvSpacePaint.vertex.glsl';
import uvSpacePaintFragment from './shaders/uvSpacePaint.fragment.glsl';
import upscaleFragment from './shaders/upscale.fragment.glsl';
import seamFixFragment from './shaders/seamFix.fragment.glsl';

/**
 * UVSpacePainter handles the 3-pass rendering pipeline for painting on meshes:
 * Pass 1: Binary paint data in UV space (source texture)
 * Pass 2: Upscale with SDF reconstruction
 * Pass 3: Seam fixing for UV islands
 */
export class UVSpacePainter {
    private uvSpaceMaterial: ShaderMaterial;
    private sourceTexture: RenderTargetTexture; 
    public paintTexture: RenderTargetTexture;
    private upscalePostProcess: PostProcess;
    private seamFixPostProcess: PostProcess;

    constructor(scene: Scene, textureName: string, targetSize: number = 2048) {
        // Pass 1: Source State Texture (The "Source of Truth")
        // Low-resolution, optimized for memory and network
        const sourceSize = 512; 
        
        this.sourceTexture = new RenderTargetTexture(
            textureName + "_source",
            { width: sourceSize, height: sourceSize },
            scene,
            { 
                generateMipMaps: false, 
                generateDepthBuffer: true, 
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
                samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE 
            }
        );

        // Pass 2: Upscaled Buffer (The "Intermediate Step")
        this.paintTexture = new RenderTargetTexture(
            textureName,
            { width: targetSize, height: targetSize },
            scene,
            { 
                generateMipMaps: false, 
                generateDepthBuffer: false, 
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE 
            }
        );

        // Prevent auto-clearing
        this.sourceTexture.onClearObservable.add(() => {});
        this.paintTexture.onClearObservable.add(() => {});

        // Initial clear
        const engine = scene.getEngine();
        engine.onEndFrameObservable.addOnce(() => {
            const clearRTT = (rtt: RenderTargetTexture) => {
                if (!rtt.renderTarget) return; 
                try {
                    engine.bindFramebuffer(rtt.renderTarget);
                    engine.clear(new Color4(0, 0, 0, 0), true, true, true);
                    engine.unBindFramebuffer(rtt.renderTarget);
                } catch (e) {
                    console.error("Clear RTT failed:", e);
                }
            };
            clearRTT(this.sourceTexture);
            clearRTT(this.paintTexture);
        });

        this.setupShaders();
        this.uvSpaceMaterial = this.createUVSpaceMaterial(scene);
        this.upscalePostProcess = this.createUpscalePostProcess(scene, sourceSize, targetSize);
        this.seamFixPostProcess = this.createSeamFixPostProcess(scene, targetSize);
    }

    private setupShaders(): void {
        Effect.ShadersStore["uvSpacePaintVertexShader"] = uvSpacePaintVertex;
        Effect.ShadersStore["uvSpacePaintFragmentShader"] = uvSpacePaintFragment;
        Effect.ShadersStore["upscaleFragmentShader"] = upscaleFragment;
        Effect.ShadersStore["seamFixFragmentShader"] = seamFixFragment;
    }
    
    private createUpscalePostProcess(scene: Scene, sourceSize: number, _targetSize: number): PostProcess {
        const pp = new PostProcess(
            "upscale",
            "upscale",
            ["texelSize", "sourceSize"],
            ["textureSampler"],
            1.0,
            null,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            scene.getEngine(),
            false,
            null,
            Constants.TEXTURETYPE_UNSIGNED_BYTE
        );
        
        pp.onApply = (effect) => {
            effect.setFloat2("texelSize", 1.0 / sourceSize, 1.0 / sourceSize);
            effect.setFloat("sourceSize", sourceSize);
            effect.setTexture("textureSampler", this.sourceTexture);
        };
        
        return pp;
    }

    private createSeamFixPostProcess(scene: Scene, textureSize: number): PostProcess {
        const pp = new PostProcess(
            "seamFix",
            "seamFix",
            ["texelSize"],
            ["textureSampler"],
            1.0, 
            null,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            scene.getEngine(),
            false,
            null,
            Constants.TEXTURETYPE_UNSIGNED_BYTE
        );
        pp.onApply = (effect) => {
            effect.setFloat2("texelSize", 1.0 / textureSize, 1.0 / textureSize);
        };
        return pp;
    }

    private createUVSpaceMaterial(scene: Scene): ShaderMaterial {
        const material = new ShaderMaterial("uvSpacePaint", scene, "uvSpacePaint", {
            attributes: ["position", "uv2"],
            uniforms: ["world", "paintSphereCenter", "paintSphereRadius", "paintColor"]
        });

        material.backFaceCulling = false;
        material.alphaMode = Engine.ALPHA_ADD;
        material.disableDepthWrite = true;
        material.needDepthPrePass = false;
        
        // Force alpha blending to be enabled
        material.needAlphaBlending = () => true;
        
        return material;
    }

    public paintAt(hitPoint: Vector3, mesh: AbstractMesh, radius: number): void {
        if (!this.uvSpaceMaterial.isReady(mesh)) {
            console.warn("[UVSpacePainter] Material not ready for mesh " + mesh.name);
            return;
        }

        this.uvSpaceMaterial.setVector3("paintSphereCenter", hitPoint);
        this.uvSpaceMaterial.setFloat("paintSphereRadius", radius);
        this.uvSpaceMaterial.setMatrix("world", mesh.getWorldMatrix());

        this.sourceTexture.renderList = [mesh];
        this.sourceTexture.setMaterialForRendering(mesh, this.uvSpaceMaterial);
        
        this.sourceTexture.render();

        this.sourceTexture.setMaterialForRendering(mesh, undefined); 

        // 2. Perform Upscale from source to paintTexture
        const scene = this.sourceTexture.getScene(); 
        if (scene) {
            scene.postProcessManager.directRender(
                [this.upscalePostProcess, this.seamFixPostProcess],
                this.paintTexture.renderTarget,
                true
            );
        }
    }
}
