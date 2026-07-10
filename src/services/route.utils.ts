import { neighbors } from '../geometry/adjacency.js';
import { kRing } from '../geometry/graph.utils.js';

export interface RouteNode {
    tokenId: string;
    isOwn: boolean;
    isHub: boolean;
}

export interface ReachableWaypoint {
    node: RouteNode;
    hopDistance: number;
}

export function nodeRadius(node: RouteNode, moveRadius: number, hubRadius: number): number {
    return node.isHub ? hubRadius : moveRadius;
}

export function reachableWaypoints(
    from: RouteNode,
    nodes: Map<string, RouteNode>,
    moveRadius: number,
    hubRadius: number,
): Array<ReachableWaypoint> {
    const fromRadius = nodeRadius(from, moveRadius, hubRadius);
    const result: Array<ReachableWaypoint> = [];
    for (const [token, distance] of kRing(Number(from.tokenId), fromRadius + hubRadius)) {
        if (distance === 0) {
            continue;
        }
        const node = nodes.get(String(token));
        if (node === undefined || distance > fromRadius + nodeRadius(node, moveRadius, hubRadius)) {
            continue;
        }
        result.push({ node, hopDistance: distance });
    }
    return result;
}

export function distancesFrom(origin: number, targets: ReadonlySet<number>, maxSteps: number): Map<number, number> {
    const found = new Map<number, number>();
    if (targets.has(origin)) {
        found.set(origin, 0);
    }
    const seen = new Set<number>([origin]);
    let frontier = [origin];
    for (let depth = 1; depth <= maxSteps && found.size < targets.size; depth++) {
        const next: Array<number> = [];
        for (const node of frontier) {
            for (const neighbor of neighbors(node)) {
                if (seen.has(neighbor)) {
                    continue;
                }
                seen.add(neighbor);
                if (targets.has(neighbor)) {
                    found.set(neighbor, depth);
                }
                next.push(neighbor);
            }
        }
        if (next.length === 0) {
            break;
        }
        frontier = next;
    }
    return found;
}
