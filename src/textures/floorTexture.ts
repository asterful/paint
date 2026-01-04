import { Scene, DynamicTexture } from '@babylonjs/core';

export function createFloorTexture(scene: Scene): DynamicTexture {
    const size = 256;
    const dt = new DynamicTexture("floor", size, scene, false);
    const ctx = dt.getContext();
    
    ctx.fillStyle = "#444444";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size);
    
    dt.update();
    dt.wrapU = 1;
    dt.wrapV = 1;
    
    return dt;
}
