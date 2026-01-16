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
        // Register inline shaders (extracted from original uvSpacePainter.ts for maintainability)
        // These could be moved to separate .glsl files if needed
        
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

            // Simplex 3D Noise 
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) { 
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );
                vec3 x1 = x0 - i1 + 1.0 * C.xxx;
                vec3 x2 = x0 - i2 + 2.0 * C.xxx;
                vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
                i = mod289(i); 
                vec4 p = permute( permute( permute( 
                            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                float n_ = 1.0/7.0;
                vec3  ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                                dot(p2,x2), dot(p3,x3) ) );
            }
            
            void main() {
                float dist = distance(vWorldPosition, paintSphereCenter);
                float noise = snoise(vWorldPosition * 3.0);
                float noisyRadius = paintSphereRadius * (1.0 + noise * 0.3);

                if (dist < noisyRadius) {
                    // Pass 1: Source State Logic - Binary Output
                    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
                } else {
                    discard;
                }
            }
        `;

        // Pass 2: Upscale & Dilate Shader
        Effect.ShadersStore["upscaleFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler; // Source (512x512)
            uniform vec2 texelSize; // 1 / SourceWidth
            uniform float sourceSize; // e.g. 512.0

            void main(void) {
                // SDF Reconstruction Algorithm
                vec2 gridUV = vUV * sourceSize;
                vec2 cellOrigin = floor(gridUV);
                
                float maxInfluence = 0.0;
                
                float radius = 1.5;        
                float outerRadius = 3.0;
                
                for(float x = -3.0; x <= 3.0; x++) {
                    for(float y = -3.0; y <= 3.0; y++) {
                        
                        if (length(vec2(x, y)) > outerRadius + 0.5) continue;

                        vec2 neighborOffset = vec2(x, y);
                        vec2 neighborCell = cellOrigin + neighborOffset;
                        
                        vec2 neighborUV = (neighborCell + 0.5) * texelSize;
                        vec4 sampleVal = texture2D(textureSampler, neighborUV);
                        
                        if (sampleVal.r > 0.1) {
                            vec2 neighborCenterInGrid = neighborCell + 0.5;
                            float dist = distance(gridUV, neighborCenterInGrid);
                            
                            float influence = smoothstep(outerRadius, radius, dist);                            
                            if (dist < radius) influence = 1.0;
                            maxInfluence = max(maxInfluence, influence);
                        }
                    }
                }
                
                gl_FragColor = vec4(maxInfluence, 0.0, 0.0, 1.0);
            }
        `;

        // Pass 3: Seam Fix Shader
        Effect.ShadersStore["seamFixFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 texelSize;

            void main(void) {
                vec4 currentPixel = texture2D(textureSampler, vUV);
                
                if (currentPixel.r > 0.0) {
                    gl_FragColor = currentPixel;
                    return;
                }
                
                float maxVal = 0.0;
                float stride = 2.0; 
                
                for(float x = -1.0; x <= 1.0; x++) {
                    for(float y = -1.0; y <= 1.0; y++) {
                         vec2 offset = vec2(x, y) * stride;
                         vec4 n = texture2D(textureSampler, vUV + offset * texelSize);
                         maxVal = max(maxVal, n.r);
                    }
                }
                
                gl_FragColor = vec4(maxVal, 0.0, 0.0, 1.0);
            }
        `;
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
