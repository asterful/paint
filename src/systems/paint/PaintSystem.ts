import { Scene, PickingInfo, PBRMaterial, Vector3 } from "@babylonjs/core";
import { PaintMaterialPlugin } from "./PaintMaterialPlugin";

/**
 * PaintSystem manages paint operations across all paintable meshes in the scene
 * Decoupled from projectile logic and other systems
 */
export class PaintSystem {
    private scene: Scene;
    private sphereRadius: number;
    private materialPlugins: Map<string, PaintMaterialPlugin> = new Map();

    constructor(scene: Scene, sphereRadius: number = 1.3) {
        this.scene = scene;
        this.sphereRadius = sphereRadius;
        this.setupPaintMaterials();
    }

    private setupPaintMaterials(): void {
        this.scene.materials.forEach(material => {
            if (material instanceof PBRMaterial) {
                const plugin = new PaintMaterialPlugin(material);
                this.materialPlugins.set(material.name, plugin);
                (material as any).paintPlugin = plugin; // Attach for easy access
                console.log(`Applied paint plugin to: ${material.name}`);
            }
        });
    }

    /**
     * Paint at a specific world position using PickingInfo
     */
    public paintAtPickInfo(pickInfo: PickingInfo): void {
        if (!pickInfo.hit || !pickInfo.pickedPoint) {
            return;
        }

        const paintCenter = pickInfo.pickedPoint;
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

    /**
     * Paint at a specific world position (without PickingInfo)
     */
    public paintAtPosition(position: Vector3, radius?: number): void {
        const paintRadius = radius ?? this.sphereRadius;
        
        this.scene.meshes.forEach(mesh => {
            if (!mesh.isEnabled() || !mesh.isVisible || !mesh.material || !(mesh.material instanceof PBRMaterial)) {
                return;
            }

            const plugin = this.materialPlugins.get(mesh.material.name);
            if (!plugin) {
                return;
            }

            const boundingInfo = mesh.getBoundingInfo();
            if (!boundingInfo) return;
            
            const meshCenter = boundingInfo.boundingSphere.centerWorld;
            const meshRadius = boundingInfo.boundingSphere.radiusWorld;
            
            if (Vector3.Distance(position, meshCenter) < (paintRadius + meshRadius)) {
                plugin.paintAt(position, mesh, paintRadius);
            }
        });
    }

    /**
     * Get a specific paint plugin by material name
     */
    public getPlugin(materialName: string): PaintMaterialPlugin | undefined {
        return this.materialPlugins.get(materialName);
    }

    /**
     * Get all registered paint plugins
     */
    public getAllPlugins(): PaintMaterialPlugin[] {
        return Array.from(this.materialPlugins.values());
    }
}
