import { Vector3 } from '@babylonjs/core';
import { Splat } from './painting';

export interface PacketPayload {
    id: number;
    pos: Vector3;
    splats: Splat[];
}

export class NetworkSimulator {
    private serverPosition: Vector3 = new Vector3(0, 2, 0);
    private lastUpdate: number = Date.now();
    private readonly MAX_SPEED: number = 14.0;

    simulateRoundTrip(
        payload: PacketPayload,
        onResponse: (accepted: boolean, serverPos: Vector3, packetId: number) => void
    ): void {
        setTimeout(() => {
            let serverAccepted = true;
            const now = Date.now();
            const timeDelta = (now - this.lastUpdate) / 1000;
            
            if (timeDelta > 0.01) {
                const dist = Vector3.Distance(payload.pos, this.serverPosition);
                const calculatedSpeed = dist / timeDelta;
                
                if (calculatedSpeed > this.MAX_SPEED) {
                    serverAccepted = false;
                } else {
                    this.serverPosition = payload.pos.clone();
                    this.lastUpdate = now;
                }
            }
            
            onResponse(serverAccepted, this.serverPosition, payload.id);
        }, 100);
    }
}
