import {
    MaterialPluginBase,
    PBRBaseMaterial,
    UniformBuffer,
    Color3,
    Vector3,
    AbstractMesh,
    VertexBuffer,
} from '@babylonjs/core';
import { UVSpacePainter } from './UVSpacePainter';

/**
 * Material plugin that integrates the paint system into PBR materials
 * Handles shader injection and texture binding
 */
export class PaintMaterialPlugin extends MaterialPluginBase {
    public paintColor = new Color3(0.0, 0.2, 0.8);
    private uvPainter: UVSpacePainter;

    constructor(material: PBRBaseMaterial) {
        super(material, "PaintPlugin", 200, {});
        
        const scene = material.getScene();
        this.uvPainter = new UVSpacePainter(
            scene,
            "paintTexture_" + material.name,
            4096
        );
        
        this._enable(true);
    }

    public paintAt(hitPoint: Vector3, mesh: AbstractMesh, radius: number = 0.5): void {
        this.uvPainter.paintAt(hitPoint, mesh, radius);
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
                "CUSTOM_FRAGMENT_UPDATE_ALBEDO": `
                    #ifdef UV2
                        vec4 paintData = texture2D(paintTextureSampler, vPaintUV);
                        float rawData = paintData.r;

                        // Pass 3: Visual Layer
                        // rawData is now a smooth Radial Distance Field from Pass 2.
                        // 0.0 = Outside 
                        // 0.5 = The theoretical "Edge"
                        // 1.0 = Inside 
                        
                        // 1. Opacity / Visibility
                        // We use a smoothstep centered on 0.5 to define the sharp paint edge.
                        float paintIntensity = smoothstep(0.4, 0.6, rawData);
                        
                        if (paintIntensity > 0.01) {
                            // 2. Bevel / Highlight using Value-Based approach (Stable across seams)
                            // We avoid dFdx/dFdy because they break at UV discontinuities (seams).
                            
                            // Calculate how close we are to the "edge" (0.5).
                            float distFromEdge = abs(rawData - 0.5);
                            
                            // Create a highlight band around the edge
                            // 0.5 +/- 0.1 => Highlight
                            float edgeBevel = 1.0 - smoothstep(0.0, 0.1, distFromEdge);

                            vec3 finalVisuals = paintColor;
                            finalVisuals += vec3(edgeBevel * 0.5); // Stronger Highlight
                            
                            // Clean mix
                            surfaceAlbedo.rgb = mix(surfaceAlbedo.rgb, finalVisuals, paintIntensity);
                        }
                    #endif
                `,
                "CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS": `
                    #ifdef UV2
                        vec4 paintDataMR = texture2D(paintTextureSampler, vPaintUV);
                        float rawDataMR = paintDataMR.r;
                        
                        // FIX: Grazing Angle Seams
                        // When viewing from an angle, mipmaps can bleed unpainted properties (shiny/specular) 
                        // into the painted edge area. 
                        // We fix this by making the Roughness/Metallic mask slightly WIDER than the visual Albedo mask.
                        // The paint becomes matte/non-metallic slightly BEFORE it becomes visible color-wise.
                        
                        // Mask starts at 0.05 (visibility) but reaches full matte strength at 0.25 (well before 0.6 core)
                        float roughnessMask = smoothstep(0.05, 0.25, rawDataMR);
                        
                        // Roughness/Metal
                        metallicRoughness.r = mix(metallicRoughness.r, 0.0, roughnessMask); 
                        metallicRoughness.g = mix(metallicRoughness.g, 1.0, roughnessMask); 
                    #endif
                `
            };
        }
        return null;
    }

    prepareDefines(defines: any, _scene: any, mesh: AbstractMesh) {
        if (mesh && mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)) {
            defines["UV2"] = true;
        }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
        uniformBuffer.updateColor3("paintColor", this.paintColor);
        uniformBuffer.setTexture('paintTextureSampler', this.uvPainter.paintTexture);
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
                { name: "paintColor", size: 3, type: "vec3" }
            ]
        };
    }

    getAttributes(attributes: string[]): void {
        attributes.push("uv2");
    }

    public getPaintTexture() {
        return this.uvPainter.paintTexture;
    }
}
