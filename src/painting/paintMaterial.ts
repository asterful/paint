import {
    MaterialPluginBase,
    PBRBaseMaterial,
    UniformBuffer,
    Color3,
    RenderTargetTexture,
    ShaderMaterial,
    Effect,
    Vector3,
    Color4,
} from '@babylonjs/core';


export class PaintMaterialPlugin extends MaterialPluginBase {
    
    paintRadius = 0.08;
    paintCenter: [number, number] = [0.5, 0.5];
    paintColor = new Color3(0.0, 0.2, 0.8);
    paintTexture: RenderTargetTexture;
    private uvSpaceMaterial: ShaderMaterial | null = null;

    constructor(material: PBRBaseMaterial) {
        super(material, "PaintPlugin", 200, {});
        
        const scene = material.getScene();
        this.paintTexture = new RenderTargetTexture(
            "paintTexture_" + material.name,
            512,
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
        
        this.setupUVSpacePainting(scene);
        this._enable(true);
    }

    private setupUVSpacePainting(scene: any): void {
        // Shader that renders mesh in UV space and tests sphere distance in world space
        Effect.ShadersStore["uvSpacePaintVertexShader"] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv2;
            
            uniform mat4 world;
            varying vec3 vWorldPosition;
            
            void main() {
                // Pass world position to fragment shader
                vWorldPosition = (world * vec4(position, 1.0)).xyz;
                
                // Use UV2 as clip space position (maps mesh into texture space)
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
        
        this.uvSpaceMaterial = new ShaderMaterial("uvSpacePaint", scene, "uvSpacePaint", {
            attributes: ["position", "uv2"],
            uniforms: ["world", "paintSphereCenter", "paintSphereRadius"]
        });
        
        this.uvSpaceMaterial.backFaceCulling = false;
    }

    paintAt(hitPoint: Vector3, mesh: any, radius: number = 0.5): void {
        if (!this.uvSpaceMaterial) return;
        
        this.uvSpaceMaterial.setVector3("paintSphereCenter", hitPoint);
        this.uvSpaceMaterial.setFloat("paintSphereRadius", radius);
        this.uvSpaceMaterial.setMatrix("world", mesh.getWorldMatrix());
        
        const originalMaterial = mesh.material;
        mesh.material = this.uvSpaceMaterial;
        
        this.paintTexture.renderList = [mesh];
        this.paintTexture.render();
        
        mesh.material = originalMaterial;
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
        if (shaderType === "vertex") {
            return {
                "CUSTOM_VERTEX_DEFINITIONS": `
                    #ifdef UV2
                        varying vec2 vPaintUV;
                    #endif
                `,
                "CUSTOM_VERTEX_MAIN_END": `
                    #ifdef UV2
                        vPaintUV = uv2;
                    #endif
                `
            };
        }

        if (shaderType === "fragment") {
            return {
                "CUSTOM_FRAGMENT_DEFINITIONS": `
                    #ifdef UV2
                        varying vec2 vPaintUV;
                        uniform sampler2D paintTextureSampler;
                    #endif
                `,
                "CUSTOM_FRAGMENT_MAIN_END": `
                    #ifdef UV2
                        vec4 paintData = texture2D(paintTextureSampler, vPaintUV);
                        
                        // If red channel has paint data, show it
                        if (paintData.r > 0.5) {
                            gl_FragColor = vec4(paintColor, 1.0);
                        }
                    #endif
                `
            };
        }
        return null;
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
        uniformBuffer.updateFloat2("paintCenter", this.paintCenter[0], this.paintCenter[1]);
        uniformBuffer.updateFloat("paintRadius", this.paintRadius);
        uniformBuffer.updateColor3("paintColor", this.paintColor);
        uniformBuffer.setTexture('paintTextureSampler', this.paintTexture);
    }

    getClassName(): string {
        return "PaintMaterialPlugin";
    }

    getSamplers(samplers: string[]) {
        samplers.push("paintTextureSampler");
    }

    getUniforms(): { ubo?: Array<{ name: string; size: number; type: string }> } {
        return {
            ubo: [
                { name: "paintCenter", size: 2, type: "vec2" },
                { name: "paintRadius", size: 1, type: "float" },
                { name: "paintColor", size: 3, type: "vec3" }
            ]
        };
    }
}
