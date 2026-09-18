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
            1024
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
                        float finalPaintVal; 
                    #endif
                `,
                "CUSTOM_FRAGMENT_MAIN_BEGIN": `
                    #ifdef UV2
                        // A sub-pixel radius (0.75). Large enough to fix the bilinear 
                        // filtering fade at the seam, but small enough that it physically 
                        // cannot cross the UV gutter into neighboring islands.
                        float offset = 0.75 / 2048.0;
                        
                        // Sample center and 8 immediate neighbors
                        float pC = texture2D(paintTextureSampler, vPaintUV).r;
                        float pN = texture2D(paintTextureSampler, vPaintUV + vec2(0.0, offset)).r;
                        float pS = texture2D(paintTextureSampler, vPaintUV + vec2(0.0, -offset)).r;
                        float pE = texture2D(paintTextureSampler, vPaintUV + vec2(offset, 0.0)).r;
                        float pW = texture2D(paintTextureSampler, vPaintUV + vec2(-offset, 0.0)).r;
                        float pNE = texture2D(paintTextureSampler, vPaintUV + vec2(offset, offset)).r;
                        float pNW = texture2D(paintTextureSampler, vPaintUV + vec2(-offset, offset)).r;
                        float pSE = texture2D(paintTextureSampler, vPaintUV + vec2(offset, -offset)).r;
                        float pSW = texture2D(paintTextureSampler, vPaintUV + vec2(-offset, -offset)).r;
                        
                        // Take the strongest value
                        float maxCross = max(pC, max(max(pN, pS), max(pE, pW)));
                        float maxDiag = max(max(pNE, pNW), max(pSE, pSW));
                        float dilated = max(maxCross, maxDiag);
                        
                        // "smoothstep" hardens the edge. If the edge faded to 0.05, 
                        // this aggressively boosts it closer to 1.0, closing the seam 
                        // without needing a larger search radius.
                        finalPaintVal = smoothstep(0.02, 0.2, dilated);
                    #endif
                `,
                "CUSTOM_FRAGMENT_UPDATE_ALBEDO": `
                    #ifdef UV2
                        if (finalPaintVal > 0.01) {
                            surfaceAlbedo.rgb = mix(surfaceAlbedo.rgb, paintColor, finalPaintVal);
                        }
                    #endif
                `,
                "CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS": `
                    #ifdef UV2
                        if (finalPaintVal > 0.01) {
                            metallicRoughness.r = mix(metallicRoughness.r, 0.0, finalPaintVal); 
                            metallicRoughness.g = mix(metallicRoughness.g, 1.0, finalPaintVal); 
                        }
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
        attributes.push("uvCentroid");
    }

    public getPaintTexture() {
        return this.uvPainter.paintTexture;
    }
}
