import { formatEther } from 'viem';

/** Resource id → name map, as served by `GET /api/v1/config` and held in the loaded chain config. */
export type ResourceNames = Record<number, string>;

/** Plain display name for a resource id, falling back to `#3` when unknown. For id-adjacent labels. */
export function resourceName(resources: ResourceNames, id: number): string {
    return resources[id] ?? `#${id}`;
}

/** Human label for a resource id, e.g. `Iron (#5)`, falling back to `resource #5` when unknown. */
export function resourceLabel(resources: ResourceNames, id: number): string {
    const name = resources[id];
    return name !== undefined ? `${name} (#${id})` : `resource #${id}`;
}

/** On-chain $CPU amounts are wei; render them human-readable. */
export function cpuFromWei(wei: string): string {
    return formatEther(BigInt(wei));
}

export function formatUnixSeconds(seconds: number): string {
    return `${new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Compact duration: `45s`, `3m`, `1.5h`. Shared by craft (per-batch) and mining (per-cycle) display. */
export function formatDuration(sec: number): string {
    if (sec < 60) {
        return `${sec}s`;
    }
    if (sec < 3600) {
        return `${Math.round(sec / 60)}m`;
    }
    return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)}h`;
}
