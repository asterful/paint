import { Scene, PickingInfo, PBRMaterial, AbstractMesh } from "@babylonjs/core";
import { PaintMaterialPlugin } from "./paintMaterial";

export class Painter {
    private scene: Scene;
    private sphereRadius: number;
    private materialPlugins: Map<string, PaintMaterialPlugin> = new Map();

    constructor(scene: Scene, sphereRadius: number) {
        this.scene = scene;
        this.sphereRadius = sphereRadius;
        this.setupPaintMaterials();
    }

    private setupPaintMaterials(): void {
        this.scene.materials.forEach(material => {
            if (material instanceof PBRMaterial) {
                const plugin = new PaintMaterialPlugin(material);
                this.materialPlugins.set(material.name, plugin);
                console.log(`Applied paint plugin to: ${material.name}`);
            }
        });
    }

    public paintAtPickInfo(pickInfo: PickingInfo): void {
        if (!pickInfo.hit || !pickInfo.pickedMesh || !pickInfo.pickedPoint) {
            return;
        }

        const mesh = pickInfo.pickedMesh as AbstractMesh;
        const material = mesh.material;
        
        if (!material || !(material instanceof PBRMaterial)) {
            return;
        }

        const plugin = this.materialPlugins.get(material.name);
        if (!plugin) {
            console.warn(`No paint plugin found for material: ${material.name}`);
            return;
        }

        // Paint with sphere at hit point in world space
        console.log(`Painting at world pos: ${pickInfo.pickedPoint}`);
        plugin.paintAt(pickInfo.pickedPoint, mesh, 1.0); // Larger radius
    }
}