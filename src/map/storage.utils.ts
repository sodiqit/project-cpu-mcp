import type { CellResourceStorage } from './types.js';

// Remaining warehouse space for a resource: cap − used, floored at 0. null means uncapped (no limit) —
// callers treat null as "fits anything", never as zero room.
export function warehouseRoom(storage: CellResourceStorage | null): bigint | null {
    if (storage === null || storage.cap === null) {
        return null;
    }
    const used = BigInt(storage.used);
    const cap = BigInt(storage.cap);
    return cap > used ? cap - used : 0n;
}

// Clamp a would-be produced amount to the warehouse room, mirroring the on-chain settle
// (mined = min(..., room)). A no-op when the resource is uncapped.
export function capByRoom(amount: bigint, storage: CellResourceStorage | null): bigint {
    const room = warehouseRoom(storage);
    return room === null || room >= amount ? amount : room;
}
