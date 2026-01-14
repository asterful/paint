import {
    RenderTargetTexture,
    ShaderMaterial,
    Effect,
    Vector3,
    Color4,
    Scene,
    AbstractMesh,
} from '@babylonjs/core';


export class UVSpacePainter {
    private uvSpaceMaterial: ShaderMaterial;
    public paintTexture: RenderTargetTexture;

    constructor(scene: Scene, textureName: string, textureSize: number = 512) {
        this.paintTexture = new RenderTargetTexture(
            textureName,
            textureSize,
            scene,
            false
        );

        const engine = scene.getEngine();
        engine.onEndFrameObservable.addOnce(() => {
            this.paintTexture.renderList = [];
            engine.bindFramebuffer(this.paintTexture.renderTarget!);
            engine.clear(new Color4(0, 0, 0, 1), true, true, true);
            engine.unBindFramebuffer(this.paintTexture.renderTarget!);
        });

        this.setupShaders();
        this.uvSpaceMaterial = this.createUVSpaceMaterial(scene);
    }


    private setupShaders(): void {
        Effect.ShadersStore["uvSpacePaintVertexShader"] = `
            precision highp float;
            
            // Attributes
            attribute vec3 position;
            attribute vec2 uv2;
            
            // Uniforms
            uniform mat4 world;
            
            // Varyings
            varying vec3 vWorldPosition;
            
            void main() {
                // Pass world position to fragment shader for distance calculation
                vWorldPosition = (world * vec4(position, 1.0)).xyz;
                
                // Use UV2 as clip space position (maps mesh into texture space)
                // This is the key: we're rendering in UV space, not screen space
                gl_Position = vec4(uv2 * 2.0 - 1.0, 0.0, 1.0);
            }
        `;

        Effect.ShadersStore["uvSpacePaintFragmentShader"] = `
            precision highp float;
            varying vec3 vWorldPosition;
            
            uniform vec3 paintSphereCenter;
            uniform float paintSphereRadius;
            
            void main() {
                float dist = distance(vWorldPosition, paintSphereCenter);
                
                // Debug: visualize distance
                if (dist < paintSphereRadius) {
                    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Red for inside sphere
                } else {
                    gl_FragColor = vec4(0.0, 1.0, 0.0, 0.1); // Green for outside
                }
            }
        `;
    }


    private createUVSpaceMaterial(scene: Scene): ShaderMaterial {
        const material = new ShaderMaterial("uvSpacePaint", scene, "uvSpacePaint", {
            attributes: ["position", "uv2"],
            uniforms: ["world", "paintSphereCenter", "paintSphereRadius", "paintColor"]
        });

        material.backFaceCulling = false;
        return material;
    }

    
    public paintAt(hitPoint: Vector3, mesh: AbstractMesh, radius: number): void {
        this.uvSpaceMaterial.setVector3("paintSphereCenter", hitPoint);
        this.uvSpaceMaterial.setFloat("paintSphereRadius", radius);
        this.uvSpaceMaterial.setMatrix("world", mesh.getWorldMatrix());

        const originalMaterial = mesh.material;
        mesh.material = this.uvSpaceMaterial;

        this.paintTexture.renderList = [mesh];
        this.paintTexture.render();

        mesh.material = originalMaterial;
    }


    public clear(): void {
        const scene = this.paintTexture.getScene();
        if (!scene) return;

        const engine = scene.getEngine();
        engine.bindFramebuffer(this.paintTexture.renderTarget!);
        engine.clear(new Color4(0, 0, 0, 0), true, true, true);
        engine.unBindFramebuffer(this.paintTexture.renderTarget!);
    }

    
    public dispose(): void {
        this.paintTexture.dispose();
        this.uvSpaceMaterial.dispose();
    }
}
