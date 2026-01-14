import {
    MaterialPluginBase,
    PBRBaseMaterial,
    UniformBuffer,
    Color3,
    Vector3,
    AbstractMesh,
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
                "CUSTOM_FRAGMENT_MAIN_END": `
                    #ifdef UV2
                        // Sample the paint texture
                        vec4 paintData = texture2D(paintTextureSampler, vPaintUV);
                        
                        // If red channel indicates paint, overlay the paint color
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

    
    dispose(): void {
        this.uvPainter.dispose();
    }
}
