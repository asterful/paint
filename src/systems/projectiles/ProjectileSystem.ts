import { Scene, Vector3, PickingInfo } from '@babylonjs/core';
import { Projectile } from './Projectile';

/**
 * ProjectileSystem manages projectile lifecycle and coordinates with other systems
 * Decoupled from PaintSystem - uses callbacks to notify of hits
 */
export class ProjectileSystem {
    private scene: Scene;
    private activeProjectiles: Set<Projectile> = new Set();
    private onProjectileHit?: (pickInfo: PickingInfo) => void;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * Set a callback to be invoked when any projectile hits something
     */
    public setHitCallback(callback: (pickInfo: PickingInfo) => void): void {
        this.onProjectileHit = callback;
    }

    /**
     * Spawn a new projectile
     */
    public spawnProjectile(
        startPosition: Vector3,
        direction: Vector3,
        speed: number,
        radius: number = 0.15
    ): Projectile {
        const projectile = new Projectile(
            this.scene,
            startPosition,
            direction,
            speed,
            (pickInfo) => {
                // Notify the system of the hit
                if (this.onProjectileHit) {
                    this.onProjectileHit(pickInfo);
                }
                // Remove from active set
                this.activeProjectiles.delete(projectile);
            },
            radius
        );

        this.activeProjectiles.add(projectile);
        return projectile;
    }

    /**
     * Get count of active projectiles (useful for debugging)
     */
    public getActiveCount(): number {
        return this.activeProjectiles.size;
    }

    /**
     * Clear all active projectiles
     */
    public clearAll(): void {
        this.activeProjectiles.forEach(projectile => projectile.dispose());
        this.activeProjectiles.clear();
    }

    /**
     * Dispose the system and all projectiles
     */
    public dispose(): void {
        this.clearAll();
    }
}
