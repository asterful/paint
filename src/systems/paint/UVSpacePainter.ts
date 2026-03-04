import {
    RenderTargetTexture,
    ShaderMaterial,
    Effect,
    Vector3,
    Color4,
    Scene,
    AbstractMesh,
    Engine,
    Constants
} from '@babylonjs/core';
import uvSpacePaintVertex from './shaders/uvSpacePaint.vertex.glsl';
import uvSpacePaintFragment from './shaders/uvSpacePaint.fragment.glsl';

export class UVSpacePainter {
    private uvSpaceMaterial: ShaderMaterial;
    public paintTexture: RenderTargetTexture;

    constructor(scene: Scene, textureName: string, textureSize: number = 512) { 
        this.paintTexture = new RenderTargetTexture(
            textureName,
            { width: textureSize, height: textureSize },
            scene,
            {
                generateMipMaps: false,
                generateDepthBuffer: false,
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE
            }
        );

        this.paintTexture.onClearObservable.add(() => {});

        const engine = scene.getEngine();
        engine.onEndFrameObservable.addOnce(() => {
            const rtt = this.paintTexture;
            if (!rtt.renderTarget) return;
            try {
                engine.bindFramebuffer(rtt.renderTarget);
                engine.clear(new Color4(0, 0, 0, 0), true, true, true);     
                engine.unBindFramebuffer(rtt.renderTarget);
            } catch (e) {
                console.error('Clear RTT failed:', e);
            }
        });

        this.setupShaders();
        this.uvSpaceMaterial = this.createUVSpaceMaterial(scene);
    }

    private setupShaders(): void {
        Effect.ShadersStore['uvSpacePaintVertexShader'] = uvSpacePaintVertex;   
        Effect.ShadersStore['uvSpacePaintFragmentShader'] = uvSpacePaintFragment;
    }

    private createUVSpaceMaterial(scene: Scene): ShaderMaterial {
        const material = new ShaderMaterial('uvSpacePaint', scene, 'uvSpacePaint', {
            attributes: ['position', 'uv2'],
            uniforms: ['world', 'paintSphereCenter', 'paintSphereRadius', 'paintColor']
        });

        material.backFaceCulling = false;
        material.alphaMode = Engine.ALPHA_ADD;
        material.disableDepthWrite = true;
        material.needDepthPrePass = false;

        material.needAlphaBlending = () => true;

        return material;
    }

    public paintAt(hitPoint: Vector3, mesh: AbstractMesh, radius: number): void {
        if (!this.uvSpaceMaterial.isReady(mesh)) {
            console.warn('[UVSpacePainter] Material not ready for mesh ' + mesh.name);
            return;
        }

        this.uvSpaceMaterial.setVector3('paintSphereCenter', hitPoint);
        this.uvSpaceMaterial.setFloat('paintSphereRadius', radius);
        this.uvSpaceMaterial.setMatrix('world', mesh.getWorldMatrix());

        this.paintTexture.renderList = [mesh];
        this.paintTexture.setMaterialForRendering(mesh, this.uvSpaceMaterial); 

        this.paintTexture.render();

        this.paintTexture.setMaterialForRendering(mesh, undefined);
    }
}
