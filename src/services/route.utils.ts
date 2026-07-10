import { RouteOptimize } from './types.js';
import { kRing } from '../geometry/graph.utils.js';
import { parseTokenId } from '../geometry/token.utils.js';

// A candidate waypoint: a revealed cell that is either the player's own or carries a Hub —
// the only cells the Transport contract accepts as route nodes.
export interface RouteNode {
    tokenId: string;
    isOwn: boolean;
    isHub: boolean;
    /** Per-unit transit fee in $CPU wei this node charges the payer; 0 unless a foreign hub. */
    feePerUnitWei: bigint;
}

export interface PlannedLeg {
    from: string;
    to: string;
    distance: number;
}

export interface PlannedRoute {
    waypoints: Array<string>;
    legs: Array<PlannedLeg>;
    totalDistance: number;
    /** Sum of per-unit fees over the route's foreign hubs, in $CPU wei. */
    feePerUnitWei: bigint;
}

export interface PlanRouteArgs {
    nodes: Array<RouteNode>;
    from: string;
    to: string;
    moveRadius: number;
    hubRadius: number;
    optimize: RouteOptimize;
}

interface PathCost {
    feePerUnitWei: bigint;
    distance: number;
}

function nodeRadius(node: RouteNode, moveRadius: number, hubRadius: number): number {
    return node.isHub ? hubRadius : moveRadius;
}

// The per-unit fee scales every route by the same shipment amount, so ranking by the per-unit sum
// is equivalent to ranking by the absolute fee.
function isBetter(candidate: PathCost, current: PathCost, optimize: RouteOptimize): boolean {
    if (optimize === RouteOptimize.Cheapest) {
        if (candidate.feePerUnitWei !== current.feePerUnitWei) {
            return candidate.feePerUnitWei < current.feePerUnitWei;
        }
        return candidate.distance < current.distance;
    }
    if (candidate.distance !== current.distance) {
        return candidate.distance < current.distance;
    }
    return candidate.feePerUnitWei < current.feePerUnitWei;
}

/**
 * Dijkstra over the eligible-waypoint graph. An edge exists between waypoints A and B when their
 * grid distance is within `radius(A) + radius(B)` — the same hop rule the Transport contract
 * enforces. Returns null when no chain reaches `to`.
 */
export function planRoute(args: PlanRouteArgs): PlannedRoute | null {
    const { nodes, from, to, moveRadius, hubRadius, optimize } = args;
    const byToken = new Map<string, RouteNode>(nodes.map((node) => [node.tokenId, node]));
    const fromNode = byToken.get(from);
    const toNode = byToken.get(to);
    if (fromNode === undefined || toNode === undefined) {
        return null;
    }

    const best = new Map<string, PathCost>();
    const previous = new Map<string, string>();
    const settled = new Set<string>();
    // The source pays its own node fee too (a route starting at a foreign hub is charged for it).
    best.set(from, { feePerUnitWei: fromNode.feePerUnitWei, distance: 0 });

    for (;;) {
        let currentToken: string | null = null;
        let currentCost: PathCost | null = null;
        for (const [token, cost] of best) {
            if (settled.has(token)) {
                continue;
            }
            if (currentCost === null || isBetter(cost, currentCost, optimize)) {
                currentToken = token;
                currentCost = cost;
            }
        }
        if (currentToken === null || currentCost === null) {
            return null;
        }
        if (currentToken === to) {
            break;
        }
        settled.add(currentToken);

        const currentNode = byToken.get(currentToken) as RouteNode;
        const reach = nodeRadius(currentNode, moveRadius, hubRadius) + hubRadius;
        for (const [neighborToken, distance] of kRing(parseTokenId(currentToken), reach)) {
            const neighbor = byToken.get(String(neighborToken));
            if (neighbor === undefined || neighbor.tokenId === currentToken || distance === 0) {
                continue;
            }
            const maxHop = nodeRadius(currentNode, moveRadius, hubRadius) + nodeRadius(neighbor, moveRadius, hubRadius);
            if (distance > maxHop) {
                continue;
            }
            const candidate: PathCost = {
                feePerUnitWei: currentCost.feePerUnitWei + neighbor.feePerUnitWei,
                distance: currentCost.distance + distance,
            };
            const known = best.get(neighbor.tokenId);
            if (known === undefined || isBetter(candidate, known, optimize)) {
                best.set(neighbor.tokenId, candidate);
                previous.set(neighbor.tokenId, currentToken);
            }
        }
    }

    const waypoints = [to];
    let cursor = to;
    while (cursor !== from) {
        const prev = previous.get(cursor);
        if (prev === undefined) {
            return null;
        }
        cursor = prev;
        waypoints.push(cursor);
    }
    waypoints.reverse();

    const legs: Array<PlannedLeg> = [];
    let totalDistance = 0;
    let prev = fromNode;
    for (const token of waypoints.slice(1)) {
        const next = byToken.get(token) as RouteNode;
        const reach = nodeRadius(prev, moveRadius, hubRadius) + nodeRadius(next, moveRadius, hubRadius);
        const distance = kRing(parseTokenId(prev.tokenId), reach).get(parseTokenId(next.tokenId)) as number;
        legs.push({ from: prev.tokenId, to: next.tokenId, distance });
        totalDistance += distance;
        prev = next;
    }

    const finalCost = best.get(to) as PathCost;
    return { waypoints, legs, totalDistance, feePerUnitWei: finalCost.feePerUnitWei };
}
