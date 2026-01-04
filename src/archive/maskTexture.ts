import { Scene, DynamicTexture } from '@babylonjs/core';

export function createMaskTexture(scene: Scene, textureResolution: number): DynamicTexture {
    const maskTexture = new DynamicTexture("mask", textureResolution, scene, false);
    const maskContext = maskTexture.getContext();
    maskContext.clearRect(0, 0, textureResolution, textureResolution);
    maskTexture.update();
    maskTexture.hasAlpha = true;
    
    return maskTexture;
}
