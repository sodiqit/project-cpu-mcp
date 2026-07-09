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

/** Renders a list of resource stacks like `3 Steel (#102), 2 Concrete (#101)` — the amount+label rendering
 *  repeated across tool output (recipes, claim outputs, demolish cost). Amount is number or string. */
export function formatStacks(
    resources: ResourceNames,
    stacks: Array<{ resourceId: number; amount: number | string }>,
    separator = ', ',
): string {
    return stacks.map((s) => `${s.amount} ${resourceLabel(resources, s.resourceId)}`).join(separator);
}

/** On-chain $CPU amounts are wei; render them human-readable. */
export function cpuFromWei(wei: string): string {
    return formatEther(BigInt(wei));
}

export function formatUnixSeconds(seconds: number): string {
    return `${new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}
