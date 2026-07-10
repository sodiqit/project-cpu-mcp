import { DISTANCE_SCAN_CAP, NEXT_HOPS_NOTE, ROUTE_NETWORK_NOTE } from './route.constants.js';
import { componentLabels, distancesFrom, networkEdges, reachableWaypoints, type RouteNode } from './route.utils.js';
import type {
    IAppConfig,
    NetworkNodeView,
    NextHopsInput,
    NextHopsResult,
    NextHopView,
    RouteCellReader,
    RouteNetworkInput,
    RouteNetworkResult,
    RouteServiceOptions,
} from './types.js';
import { BuildingType } from '../api/types.js';
import { tokenIdToPos } from '../geometry/token.utils.js';
import type { ILogger } from '../logger/types.js';
import type { CellState } from '../map/types.js';
import type { WalletProvider } from '../wallet/types.js';

export class RouteService {
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly mapReader: RouteCellReader;
    private readonly logger: ILogger;

    constructor(options: RouteServiceOptions) {
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.mapReader = options.mapReader;
        this.logger = options.logger;
    }

    async nextHops(input: NextHopsInput): Promise<NextHopsResult> {
        const from = String(input.from);
        const towards = input.towards === null ? null : String(input.towards);
        if (from === towards) {
            throw new Error('`from` and `towards` must be different cells.');
        }

        const config = await this.appConfig.load();
        const routing = config.transport;
        const address = this.wallet.get().getAddress().toLowerCase();

        const nodes = new Map<string, RouteNode>();
        const cellsByToken = new Map<string, CellState>();
        for (const cell of this.mapReader.allCells()) {
            cellsByToken.set(cell.tokenId, cell);
            const isOwn = cell.owner.toLowerCase() === address;
            const isHub = cell.building !== null && cell.building.type === BuildingType.Hub;
            if (cell.revealCount === 0 || (!isOwn && !isHub)) {
                continue;
            }
            nodes.set(cell.tokenId, { tokenId: cell.tokenId, isOwn, isHub });
        }

        this.assertEligible(from, nodes, cellsByToken);
        const fromNode = nodes.get(from) as RouteNode;

        const reachable = reachableWaypoints(fromNode, nodes, routing.moveRadius, routing.hubRadius);

        let targetDistance: number | null = null;
        const toTarget = new Map<number, number>();
        if (towards !== null) {
            const targets = new Set<number>([Number(from), ...reachable.map((r) => Number(r.node.tokenId))]);
            for (const [token, distance] of distancesFrom(Number(towards), targets, DISTANCE_SCAN_CAP)) {
                toTarget.set(token, distance);
            }
            targetDistance = toTarget.get(Number(from)) ?? null;
        }

        const hops: Array<NextHopView> = reachable.map(({ node, hopDistance }) => {
            const cell = cellsByToken.get(node.tokenId) as CellState;
            return {
                tokenId: node.tokenId,
                pos: tokenIdToPos(node.tokenId),
                hopDistance,
                isOwn: node.isOwn,
                isHub: node.isHub,
                owner: cell.owner,
                transitFeePerUnit: !node.isOwn && node.isHub ? (cell.transitFeePerUnit ?? '0') : null,
                distanceToTarget: towards === null ? null : (toTarget.get(Number(node.tokenId)) ?? null),
            };
        });
        hops.sort((a, b) => {
            if (towards !== null && a.distanceToTarget !== b.distanceToTarget) {
                return (a.distanceToTarget ?? Infinity) - (b.distanceToTarget ?? Infinity);
            }
            return a.hopDistance - b.hopDistance || Number(a.tokenId) - Number(b.tokenId);
        });

        this.logger.info('surveyed next hops', { from, towards, hops: hops.length });
        return {
            from,
            fromIsHub: fromNode.isHub,
            towards,
            targetDistance,
            reach: { moveRadius: routing.moveRadius, hubRadius: routing.hubRadius },
            hops,
            note: NEXT_HOPS_NOTE,
        };
    }

    async network(input: RouteNetworkInput): Promise<RouteNetworkResult> {
        const from = input.from === null ? null : String(input.from);
        const towards = input.towards === null ? null : String(input.towards);

        const config = await this.appConfig.load();
        const routing = config.transport;
        const address = this.wallet.get().getAddress().toLowerCase();

        const nodes = new Map<string, RouteNode>();
        const cellsByToken = new Map<string, CellState>();
        for (const cell of this.mapReader.allCells()) {
            cellsByToken.set(cell.tokenId, cell);
            const isOwn = cell.owner.toLowerCase() === address;
            const isHub = cell.building !== null && cell.building.type === BuildingType.Hub;
            if (cell.revealCount === 0 || (!isOwn && !isHub)) {
                continue;
            }
            nodes.set(cell.tokenId, { tokenId: cell.tokenId, isOwn, isHub });
        }

        const edges = networkEdges(nodes, routing.moveRadius, routing.hubRadius);
        const components = componentLabels(nodes, edges);

        const nodeTokens = new Set<number>([...nodes.keys()].map(Number));
        const fromSource = from === null ? null : distancesFrom(Number(from), nodeTokens, DISTANCE_SCAN_CAP);
        const toTarget =
            towards === null
                ? null
                : distancesFrom(
                      Number(towards),
                      new Set([...nodeTokens, ...(from === null ? [] : [Number(from)])]),
                      DISTANCE_SCAN_CAP,
                  );

        const views: Array<NetworkNodeView> = [...nodes.values()]
            .sort((a, b) => Number(a.tokenId) - Number(b.tokenId))
            .map((node) => {
                const cell = cellsByToken.get(node.tokenId) as CellState;
                return {
                    tokenId: node.tokenId,
                    pos: tokenIdToPos(node.tokenId),
                    isOwn: node.isOwn,
                    isHub: node.isHub,
                    owner: cell.owner,
                    transitFeePerUnit: !node.isOwn && node.isHub ? (cell.transitFeePerUnit ?? '0') : null,
                    distFromSource: fromSource === null ? null : (fromSource.get(Number(node.tokenId)) ?? null),
                    distToTarget: toTarget === null ? null : (toTarget.get(Number(node.tokenId)) ?? null),
                    component: components.get(node.tokenId) as number,
                };
            });

        const result: RouteNetworkResult = {
            from,
            towards,
            fromToTarget: from === null || toTarget === null ? null : (toTarget.get(Number(from)) ?? null),
            reach: { moveRadius: routing.moveRadius, hubRadius: routing.hubRadius },
            components: new Set(components.values()).size,
            nodes: views,
            edges,
            note: ROUTE_NETWORK_NOTE,
        };
        this.logger.info('surveyed route network', {
            nodes: views.length,
            edges: edges.length,
            components: result.components,
        });
        return result;
    }

    private assertEligible(tokenId: string, nodes: Map<string, RouteNode>, cells: Map<string, CellState>): void {
        if (nodes.has(tokenId)) {
            return;
        }
        const cell = cells.get(tokenId) ?? null;
        if (cell === null) {
            throw new Error(`Cell ${tokenId} is not in the current map (unminted or not yet synced).`);
        }
        if (cell.revealCount === 0) {
            throw new Error(`Cell ${tokenId} is not revealed; reveal it first (cpu_reveal).`);
        }
        throw new Error(`Cell ${tokenId} is not an eligible waypoint: it must be a cell you own or carry a Hub.`);
    }
}
