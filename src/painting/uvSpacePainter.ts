import {
    RenderTargetTexture,
    ShaderMaterial,
    Effect,
    Vector3,
    Color4,
    Scene,
    AbstractMesh,
    Engine,
} from '@babylonjs/core';


export class UVSpacePainter {
    private uvSpaceMaterial: ShaderMaterial;
    public paintTexture: RenderTargetTexture;

    constructor(scene: Scene, textureName: string, textureSize: number = 512) {
        this.paintTexture = new RenderTargetTexture(
            textureName,
            { width: textureSize, height: textureSize },
            scene,
            { generateMipMaps: false, generateDepthBuffer: false }
        );

        // Prevent auto-clearing by adding empty observer to onClearObservable
        this.paintTexture.onClearObservable.add(() => {});

        // Initial clear only once
        const engine = scene.getEngine();
        engine.onEndFrameObservable.addOnce(() => {
            engine.bindFramebuffer(this.paintTexture.renderTarget!);
            engine.clear(new Color4(0, 0, 0, 0), true, false, false);
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
                
                if (dist < paintSphereRadius) {
                    // Create a "solid core" look instead of a whispy spray
                    // 0.0 to 0.8 radius = 1.0 intensity (Solid paint)
                    // 0.8 to 1.0 radius = fades to 0.0 (Soft Edge)
                    float edgeSoftness = 0.2; 
                    float softStart = paintSphereRadius * (1.0 - edgeSoftness);
                    
                    float falloff = 1.0 - smoothstep(softStart, paintSphereRadius, dist);
                    
                    gl_FragColor = vec4(falloff, 0.0, 0.0, 1.0);
                } else {
                    discard;
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
        material.alphaMode = Engine.ALPHA_ADD;
        material.needDepthPrePass = false;
        material.disableDepthWrite = true;
        
        // Force alpha blending to be enabled
        material.needAlphaBlending = () => true;
        
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
