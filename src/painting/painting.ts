import { Scene, Vector3, PBRMaterial } from "@babylonjs/core";
import { PaintMaterialPlugin } from "./paintMaterial";

export class Painter {
    private scene: Scene;
    private sphereRadius: number;

    constructor(scene: Scene, sphereRadius: number) {
        this.scene = scene;
        this.sphereRadius = sphereRadius;
        this.setupPaintMaterials();
    }

    private setupPaintMaterials(): void {
        this.scene.materials.forEach(material => {
            if (material instanceof PBRMaterial) {
                new PaintMaterialPlugin(material);
                console.log(`Applied paint plugin to: ${material.name}`);
            }
        });
    }

    public paintAt(hitPoint: Vector3): void {
        //const sphere = MeshBuilder.CreateSphere("paintSplat", { diameter: this.sphereRadius * 2 }, this.scene);
        //sphere.position = hitPoint;
        console.log(`Painted at: ${hitPoint}`);
    }
}