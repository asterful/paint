import { Scene, PickingInfo, PBRMaterial, AbstractMesh, Vector3 } from "@babylonjs/core";
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
        if (!pickInfo.hit || !pickInfo.pickedPoint) {
            return;
        }

        const paintCenter = pickInfo.pickedPoint;
        // Ensure radius is valid (fallback if 0)
        const radius = this.sphereRadius > 0 ? this.sphereRadius : 1.0;

        console.log(`Painting at world pos: ${paintCenter} with radius ${radius}`);

        // Iterate all meshes to find potential targets that intersect with the paint sphere
        this.scene.meshes.forEach(mesh => {
            // 1. Check if mesh is valid and has a paintable material
            if (!mesh.isEnabled() || !mesh.isVisible || !mesh.material || !(mesh.material instanceof PBRMaterial)) {
                return;
            }

            const plugin = this.materialPlugins.get(mesh.material.name);
            if (!plugin) {
                return;
            }

            // 2. Check intersection between paint sphere and mesh bounding sphere
            const boundingInfo = mesh.getBoundingInfo();
            if (!boundingInfo) return;
            
            const meshCenter = boundingInfo.boundingSphere.centerWorld;
            const meshRadius = boundingInfo.boundingSphere.radiusWorld;
            
            // If the mesh is within the paint sphere's influence
            if (Vector3.Distance(paintCenter, meshCenter) < (radius + meshRadius)) {
                plugin.paintAt(paintCenter, mesh, radius);
            }
        });
    }
}