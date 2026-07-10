import { neighbors } from './adjacency.js';
import { assertTokenIdInRange } from './cell.utils.js';

// Disk of cells within `radius` grid steps: tokenId → distance (BFS ring number), center included at 0.
export function kRing(tokenId: number, radius: number): Map<number, number> {
    assertTokenIdInRange(tokenId);
    if (!Number.isInteger(radius) || radius < 0) {
        throw new Error(`kRing radius must be a non-negative integer, got ${radius}`);
    }
    const distance = new Map<number, number>([[tokenId, 0]]);
    let frontier = [tokenId];
    for (let depth = 1; depth <= radius; depth++) {
        const next: Array<number> = [];
        for (const node of frontier) {
            for (const neighbor of neighbors(node)) {
                if (distance.has(neighbor)) {
                    continue;
                }
                distance.set(neighbor, depth);
                next.push(neighbor);
            }
        }
        if (next.length === 0) {
            break;
        }
        frontier = next;
    }
    return distance;
}

// Grid-step distance, or -1 when farther than `maxSteps` — mirrors the on-chain bounded BFS.
export function gridDistanceWithin(from: number, to: number, maxSteps: number): number {
    assertTokenIdInRange(from);
    assertTokenIdInRange(to);
    if (from === to) {
        return 0;
    }
    const seen = new Set<number>([from]);
    let frontier = [from];
    for (let depth = 1; depth <= maxSteps; depth++) {
        const next: Array<number> = [];
        for (const node of frontier) {
            for (const neighbor of neighbors(node)) {
                if (seen.has(neighbor)) {
                    continue;
                }
                if (neighbor === to) {
                    return depth;
                }
                seen.add(neighbor);
                next.push(neighbor);
            }
        }
        if (next.length === 0) {
            break;
        }
        frontier = next;
    }
    return -1;
}

// Shortest cell-by-cell path [from, …, to] (BFS — the graph is unweighted), or null when unreachable.
export function findPath(from: number, to: number): Array<number> | null {
    assertTokenIdInRange(from);
    assertTokenIdInRange(to);
    if (from === to) {
        return [from];
    }
    const cameFrom = new Map<number, number>([[from, from]]);
    let frontier = [from];
    while (frontier.length > 0) {
        const next: Array<number> = [];
        for (const node of frontier) {
            for (const neighbor of neighbors(node)) {
                if (cameFrom.has(neighbor)) {
                    continue;
                }
                cameFrom.set(neighbor, node);
                if (neighbor === to) {
                    const path = [to];
                    let cursor = to;
                    while (cursor !== from) {
                        cursor = cameFrom.get(cursor) as number;
                        path.push(cursor);
                    }
                    return path.reverse();
                }
                next.push(neighbor);
            }
        }
        frontier = next;
    }
    return null;
}
