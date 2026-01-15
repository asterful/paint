import {
    MaterialPluginBase,
    PBRBaseMaterial,
    UniformBuffer,
    Color3,
    Vector3,
    AbstractMesh,
    VertexBuffer,
} from '@babylonjs/core';
import { UVSpacePainter } from './uvSpacePainter';


export class PaintMaterialPlugin extends MaterialPluginBase {

    public paintColor = new Color3(0.0, 0.2, 0.8);
    private uvPainter: UVSpacePainter;

    constructor(material: PBRBaseMaterial) {
        super(material, "PaintPlugin", 200, {});
        
        const scene = material.getScene();
        this.uvPainter = new UVSpacePainter(
            scene,
            "paintTexture_" + material.name,
            512
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
                        // Sample the paint texture - red channel contains intensity (0-1)
                        vec4 paintData = texture2D(paintTextureSampler, vPaintUV);
                        float paintIntensity = paintData.r;
                        
                        if (paintIntensity > 0.01) {
                            // Calculate edge detection using texture derivatives
                            // This gives us the gradient - where paint intensity changes rapidly
                            float dx = dFdx(paintIntensity);
                            float dy = dFdy(paintIntensity);
                            float edgeGradient = sqrt(dx * dx + dy * dy);
                            
                            // Normalize and invert - high values at edges
                            float edgeFactor = smoothstep(0.0, 0.15, edgeGradient);
                            
                            // Create rim highlight - brighten the edges
                            float rimHighlight = edgeFactor * 0.8;
                            
                            // Make center darker/richer, edges brighter (like thick paint)
                            vec3 paintWithVolume = paintColor * (1.0 + rimHighlight);
                            
                            // Add subtle darkening in the center for depth
                            float centerDarken = (1.0 - edgeFactor) * paintIntensity * 0.2;
                            paintWithVolume = mix(paintWithVolume, paintColor * 0.7, centerDarken);
                            
                            // Apply paint
                            surfaceAlbedo.rgb = mix(surfaceAlbedo.rgb, paintWithVolume, paintIntensity);
                        }
                    #endif
                `,
                "CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS": `
                    #ifdef UV2
                        vec4 paintData = texture2D(paintTextureSampler, vPaintUV);
                        float paintIntensity = paintData.r;
                        
                        // Make painted areas completely non-metallic and very rough (matte)
                        // This removes all specular/fresnel reflections
                        metallicRoughness.r = mix(metallicRoughness.r, 0.0, paintIntensity); // Metallic to 0
                        metallicRoughness.g = mix(metallicRoughness.g, 1.0, paintIntensity); // Roughness to 1
                    #endif
                `,
            };
        }
        return null;
    }

    // Note: Depending on Babylon version this is sometimes called "prepareDefines"
    // Base signature: prepareDefines(defines: MaterialDefines, scene: Scene, mesh: AbstractMesh)
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
}
