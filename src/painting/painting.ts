import { Scene, Vector3, MeshBuilder } from "@babylonjs/core";

export class Painter {
    private scene: Scene;
    private sphereRadius: number;

    constructor(scene: Scene, sphereRadius: number) {
        this.scene = scene;
        this.sphereRadius = sphereRadius;
    }

    public paintAt(hitPoint: Vector3): void {
        const sphere = MeshBuilder.CreateSphere("paintSplat", { diameter: this.sphereRadius * 2 }, this.scene);
        sphere.position = hitPoint;
        console.log(`Painted at: ${hitPoint}`);
    }
}