import { Scene, Ray, DynamicTexture, Vector2, Mesh, Vector3 } from '@babylonjs/core';

export interface Splat {
    meshName: string;
    u: number;
    v: number;
    seed: number;
}

export class PaintingSystem {
    private textureResolution: number;
    private shadowGrids: Map<string, Uint8Array> = new Map();
    private totalPaintedPixels: number = 0;
    private scene: Scene;

    constructor(textureResolution: number, scene: Scene) {
        this.textureResolution = textureResolution;
        this.scene = scene;
    }

    public registerSurface(meshName: string): void {
        this.shadowGrids.set(meshName, new Uint8Array(this.textureResolution * this.textureResolution));
    }

    drawSplat(
        meshName: string,
        u: number, 
        v: number, 
        seed: number, 
        ctx: CanvasRenderingContext2D, 
        updateGrid: boolean = false
    ): void {
        const x = Math.floor(u * this.textureResolution);
        const y = Math.floor((1 - v) * this.textureResolution);
        
        const shadowGrid = this.shadowGrids.get(meshName);
        if (!shadowGrid && updateGrid) return;
        
        // Scale factor to normalize splat size across different mesh sizes
        // Ground: 20x20 units with UV 0-1, so 1 UV unit = 20 world units
        // Wall: 8x4 units with UV 0-0.4 x 0-0.2, so 1 UV unit = 20 world units (same as ground!)
        // Since wall UV is already scaled proportionally in faceUV, no additional scaling needed
        let scaleX = 1.0;
        let scaleY = 1.0;
        
        ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
        
        let currentSeed = seed;
        const random = () => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        };

        const drawCircle = (cx: number, cy: number, r: number) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scaleX, scaleY);
            ctx.translate(-cx, -cy);
            
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.restore();

            if (updateGrid && shadowGrid) {
                const minX = Math.max(0, Math.floor(cx - r * scaleX));
                const maxX = Math.min(this.textureResolution - 1, Math.floor(cx + r * scaleX));
                const minY = Math.max(0, Math.floor(cy - r * scaleY));
                const maxY = Math.min(this.textureResolution - 1, Math.floor(cy + r * scaleY));
                
                for (let py = minY; py <= maxY; py++) {
                    for (let px = minX; px <= maxX; px++) {
                        const idx = py * this.textureResolution + px;
                        if (shadowGrid[idx] === 0) {
                            const dx = (px - cx) / scaleX;
                            const dy = (py - cy) / scaleY;
                            if (dx * dx + dy * dy <= r * r) {
                                shadowGrid[idx] = 1;
                                this.totalPaintedPixels++;
                            }
                        }
                    }
                }
            }
        };

        // Main Blob
        drawCircle(x, y, 15 + random() * 10);

        // Droplets
        const droplets = 3 + Math.floor(random() * 5);
        for (let i = 0; i < droplets; i++) {
            const angle = random() * Math.PI * 2;
            const dist = 20 + random() * 12;
            const size = 3 + random() * 5;
            drawCircle(
                x + Math.cos(angle) * dist, 
                y + Math.sin(angle) * dist, 
                size
            );
        }
    }

    clearShadowGrids(): void {
        for (const grid of this.shadowGrids.values()) {
            grid.fill(0);
        }
        this.totalPaintedPixels = 0;
    }

    rebuildShadowGrids(
        confirmedSplats: Splat[],
        pendingSplats: Splat[],
        backingContexts: Map<string, CanvasRenderingContext2D>
    ): void {
        this.clearShadowGrids();
        for (const splat of confirmedSplats) {
            const ctx = backingContexts.get(splat.meshName);
            if (ctx) {
                this.drawSplat(splat.meshName, splat.u, splat.v, splat.seed, ctx, true);
            }
        }
        for (const splat of pendingSplats) {
            const ctx = backingContexts.get(splat.meshName);
            if (ctx) {
                this.drawSplat(splat.meshName, splat.u, splat.v, splat.seed, ctx, true);
            }
        }
    }

    getCoveragePercent(): number {
        const totalPixels = this.shadowGrids.size * this.textureResolution * this.textureResolution;
        return totalPixels > 0 ? (this.totalPaintedPixels / totalPixels) * 100 : 0;
    }

    public paintSphere(position: Vector3, radius: number): Splat[] {
        const splats: Splat[] = [];
        const meshes = this.scene.meshes.filter(m => m.name === 'ground' || m.name === 'wall');
        
        const sphereSeed = Math.random();
        
        for (const mesh of meshes) {
            if (!(mesh instanceof Mesh)) continue;
            
            // Find the closest point on the mesh to the sphere center
            const directions = [
                new Vector3(0, -1, 0),
                new Vector3(0, 1, 0),
                new Vector3(0, 0, 1),
                new Vector3(0, 0, -1),
                new Vector3(1, 0, 0),
                new Vector3(-1, 0, 0),
            ];
            
            let closestHit = null;
            let closestDistance = Infinity;
            
            for (const dir of directions) {
                const ray = new Ray(position, dir, radius * 2);
                const hit = this.scene.pickWithRay(ray, (m) => m === mesh);
                
                if (hit?.hit && hit.distance < closestDistance) {
                    closestDistance = hit.distance;
                    closestHit = hit;
                }
            }
            
            // If we found a hit within sphere radius, paint the overlap area
            if (closestHit && closestDistance <= radius) {
                const uv = closestHit.getTextureCoordinates();
                const hitPoint = closestHit.pickedPoint;
                const normal = closestHit.getNormal(true);
                
                if (uv && hitPoint && normal) {
                    // Calculate how much sphere overlaps (0 at edge, 1 at center)
                    const overlapFactor = 1.0 - (closestDistance / radius);
                    
                    // Sample multiple points in a grid around the hit point
                    const samples = 5;
                    const spreadWorld = radius * overlapFactor * 0.8; // How far to spread in world space
                    
                    // Create tangent vectors perpendicular to normal
                    const tangent1 = Vector3.Cross(normal, new Vector3(1, 0, 0).normalize());
                    if (tangent1.length() < 0.1) {
                        tangent1.copyFrom(Vector3.Cross(normal, new Vector3(0, 1, 0).normalize()));
                    }
                    tangent1.normalize();
                    const tangent2 = Vector3.Cross(normal, tangent1).normalize();
                    
                    // Sample points in a circular pattern on the surface
                    for (let i = -samples; i <= samples; i++) {
                        for (let j = -samples; j <= samples; j++) {
                            const dist = Math.sqrt(i * i + j * j) / samples;
                            if (dist > 1) continue; // Only points within circle
                            
                            const offsetWorld = tangent1.scale(i * spreadWorld / samples)
                                .add(tangent2.scale(j * spreadWorld / samples));
                            const samplePoint = hitPoint.add(offsetWorld);
                            
                            // Cast ray from sample point to mesh to get UV
                            const sampleRay = new Ray(samplePoint.add(normal.scale(0.1)), normal.scale(-1), 0.5);
                            const sampleHit = this.scene.pickWithRay(sampleRay, (m) => m === mesh);
                            
                            if (sampleHit?.hit) {
                                const sampleUV = sampleHit.getTextureCoordinates();
                                if (sampleUV) {
                                    splats.push({
                                        meshName: mesh.name,
                                        u: sampleUV.x,
                                        v: sampleUV.y,
                                        seed: sphereSeed
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return splats;
    }
}
