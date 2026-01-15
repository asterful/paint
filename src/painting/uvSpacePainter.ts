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


export class UVSpacePainter {
    private uvSpaceMaterial: ShaderMaterial;
    private bufferTexture: RenderTargetTexture; 
    public paintTexture: RenderTargetTexture;
    private dilationPostProcess: PostProcess;

    constructor(scene: Scene, textureName: string, textureSize: number = 512) {
        // 1. Create the buffer texture (where paint accumulates)
        this.bufferTexture = new RenderTargetTexture(
            textureName + "_buffer",
            { width: textureSize, height: textureSize },
            scene,
            { 
                generateMipMaps: false, 
                generateDepthBuffer: true, 
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE 
            }
        );

        // 2. Create the output texture (dilated result used by material)
        this.paintTexture = new RenderTargetTexture(
            textureName,
            { width: textureSize, height: textureSize },
            scene,
            { 
                generateMipMaps: false, 
                generateDepthBuffer: true, 
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE 
            }
        );

        // Prevent auto-clearing
        this.bufferTexture.onClearObservable.add(() => {});
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
            clearRTT(this.bufferTexture);
            clearRTT(this.paintTexture);
        });

        this.setupShaders();
        this.uvSpaceMaterial = this.createUVSpaceMaterial(scene);
        this.dilationPostProcess = this.createDilationPostProcess(scene, textureSize);
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
                    float edgeSoftness = 0.2; 
                    float softStart = paintSphereRadius * (1.0 - edgeSoftness);
                    
                    float falloff = 1.0 - smoothstep(softStart, paintSphereRadius, dist);
                    
                    gl_FragColor = vec4(falloff, 0.0, 0.0, 1.0);
                } else {
                    discard;
                }
            }
        `;

        // Dilation Shader for seams
        Effect.ShadersStore["dilationFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 texelSize;

            void main(void) {
                vec4 baseColor = texture2D(textureSampler, vUV);

                // If this pixel has paint, keep it
                if (baseColor.r > 0.0) {
                    gl_FragColor = baseColor;
                } else {
                    // Otherwise check neighbors (3x3 kernel) to expand paint
                    float maxFill = 0.0;
                    
                    // Simple infinite expansion to fill gaps
                    for(float x = -1.0; x <= 1.0; x++) {
                        for(float y = -1.0; y <= 1.0; y++) {
                            vec4 neighbor = texture2D(textureSampler, vUV + vec2(x, y) * texelSize);
                            maxFill = max(maxFill, neighbor.r);
                        }
                    }
                    
                    gl_FragColor = vec4(maxFill, 0.0, 0.0, 1.0);
                }
            }
        `;
    }
    
    private createDilationPostProcess(scene: Scene, textureSize: number): PostProcess {
        const pp = new PostProcess(
            "dilation",
            "dilation",
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
            effect.setTexture("textureSampler", this.bufferTexture);
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
        // Chrome requires shader to be compiled and ready before rendering
        if (!this.uvSpaceMaterial.isReady(mesh)) {
            console.warn("[UVSpacePainter] Material not ready for mesh " + mesh.name);
            return;
        }

        this.uvSpaceMaterial.setVector3("paintSphereCenter", hitPoint);
        this.uvSpaceMaterial.setFloat("paintSphereRadius", radius);
        this.uvSpaceMaterial.setMatrix("world", mesh.getWorldMatrix());


        this.bufferTexture.renderList = [mesh];
        this.bufferTexture.setMaterialForRendering(mesh, this.uvSpaceMaterial);
        
        this.bufferTexture.render();

        this.bufferTexture.setMaterialForRendering(mesh, undefined); 

        // 2. Perform UV dilation from buffer to the final texture
        const scene = this.bufferTexture.getScene();
        if (scene) {
            scene.postProcessManager.directRender(
                [this.dilationPostProcess],
                this.paintTexture.renderTarget,
                true
            );
        }
    }

}