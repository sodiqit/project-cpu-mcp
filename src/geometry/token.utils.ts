import { neighbors } from './adjacency.js';
import { tokenIdToCell } from './cell.utils.js';
import { MAX_TOKEN_ID, MIN_TOKEN_ID } from './constants.js';
import { kRing } from './graph.utils.js';
import type { CellCoord } from './types.js';

// String-facing adapters: the rest of the client keys cells by decimal-string tokenIds.

export function parseTokenId(tokenId: string): number {
    const value = /^[1-9][0-9]*$/.test(tokenId) ? Number(tokenId) : NaN;
    if (!Number.isInteger(value) || value < MIN_TOKEN_ID || value > MAX_TOKEN_ID) {
        throw new Error(`tokenId must be an integer in [${MIN_TOKEN_ID}, ${MAX_TOKEN_ID}], got "${tokenId}"`);
    }
    return value;
}

export function neighborTokenIds(tokenId: string): Array<string> {
    return neighbors(parseTokenId(tokenId)).map(String);
}

export function ringDistances(tokenId: string, radius: number): Map<string, number> {
    const result = new Map<string, number>();
    for (const [token, distance] of kRing(parseTokenId(tokenId), radius)) {
        result.set(String(token), distance);
    }
    return result;
}

// Distance to the nearest member of `targets`, or null when none is within `maxSteps`.
export function nearestDistanceWithin(from: string, targets: ReadonlySet<string>, maxSteps: number): number | null {
    const start = parseTokenId(from);
    if (targets.has(from)) {
        return 0;
    }
    const seen = new Set<number>([start]);
    let frontier = [start];
    for (let depth = 1; depth <= maxSteps; depth++) {
        const next: Array<number> = [];
        for (const node of frontier) {
            for (const neighbor of neighbors(node)) {
                if (seen.has(neighbor)) {
                    continue;
                }
                if (targets.has(String(neighbor))) {
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
    return null;
}

export function tokenIdToPos(tokenId: string): CellCoord {
    return tokenIdToCell(parseTokenId(tokenId));
}
