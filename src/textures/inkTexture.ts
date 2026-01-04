import { Scene, DynamicTexture } from '@babylonjs/core';

export function createInkTexture(scene: Scene): DynamicTexture {
    const size = 128;
    const dt = new DynamicTexture("ink", size, scene, false);
    const ctx = dt.getContext();
    
    // Background: Bright Blue
    ctx.fillStyle = "#0096FF";
    ctx.fillRect(0, 0, size, size);
    
    // Detail: Lighter Blue diagonal stripes
    ctx.fillStyle = "#33adff";
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.lineTo(size, 20);
    ctx.lineTo(20, size);
    ctx.fill();
    
    // Detail: Glow dots
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.arc(32, 32, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(96, 96, 5, 0, Math.PI * 2);
    ctx.fill();
    
    dt.update();
    dt.wrapU = 1;
    dt.wrapV = 1;
    
    return dt;
}
