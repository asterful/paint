import {
    MaterialPluginBase,
    PBRBaseMaterial,
    UniformBuffer,
    Color3,
} from '@babylonjs/core';


export class PaintMaterialPlugin extends MaterialPluginBase {
    
    paintRadius = 0.08;
    paintCenter: [number, number] = [0.5, 0.5];
    paintColor = new Color3(0.0, 0.2, 0.8);

    constructor(material: PBRBaseMaterial) {
        super(material, "PaintPlugin", 200, {});
        this._enable(true);
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
                    #endif
                `,
                "CUSTOM_FRAGMENT_MAIN_END": `
                    #ifdef UV2
                        vec2 uvDiff = vPaintUV - paintCenter;
                        float distanceFromCenter = length(uvDiff);
                        
                        if (distanceFromCenter < paintRadius) {
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
    }

    getClassName(): string {
        return "PaintMaterialPlugin";
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
