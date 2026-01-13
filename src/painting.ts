import { Scene, Vector3, MeshBuilder } from "@babylonjs/core";

export function paint(scene: Scene, hitPoint: Vector3) {
    const sphere = MeshBuilder.CreateSphere("paintSplat", { diameter: 0.8 }, scene);
    sphere.position = hitPoint;
    console.log(`Painted at: ${hitPoint}`);
}