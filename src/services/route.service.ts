import { parseEther } from 'viem';

import { ROUTE_VERIFY_NOTE } from './route.constants.js';
import { planRoute, type RouteNode } from './route.utils.js';
import type {
    IAppConfig,
    PlanRouteInput,
    PlanRouteResult,
    RouteCellReader,
    RouteHubFeeView,
    RouteServiceOptions,
} from './types.js';
import { BuildingType } from '../api/types.js';
import type { ILogger } from '../logger/types.js';
import type { CellState } from '../map/types.js';
import { cpuFromWei } from '../utils/format.utils.js';
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

    async plan(input: PlanRouteInput): Promise<PlanRouteResult> {
        if (input.from === input.to) {
            throw new Error('Source and target must be different cells.');
        }
        const from = String(input.from);
        const to = String(input.to);

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
            nodes.set(cell.tokenId, {
                tokenId: cell.tokenId,
                isOwn,
                isHub,
                feePerUnitWei: !isOwn && isHub ? parseEther(cell.transitFeePerUnit ?? '0') : 0n,
            });
        }

        this.assertEligible(from, nodes, cellsByToken, 'Source');
        this.assertEligible(to, nodes, cellsByToken, 'Target');

        const plan = planRoute({
            nodes: [...nodes.values()],
            from,
            to,
            moveRadius: routing.moveRadius,
            hubRadius: routing.hubRadius,
            optimize: input.optimize,
        });
        if (plan === null) {
            throw new Error(
                `No valid waypoint chain from ${from} to ${to}: every hop must span at most ` +
                    `radius(from)+radius(to) grid steps (${routing.moveRadius} for a plain cell, ` +
                    `${routing.hubRadius} for a Hub) between revealed cells you own or Hubs. ` +
                    'Build a Hub to bridge the gap, or route through closer cells.',
            );
        }

        const amount = input.amount === null ? null : BigInt(input.amount);
        const foreignHubs: Array<RouteHubFeeView> = [];
        for (const tokenId of plan.waypoints) {
            const node = nodes.get(tokenId) as RouteNode;
            if (node.isOwn || !node.isHub) {
                continue;
            }
            const cell = cellsByToken.get(tokenId) as CellState;
            const perUnitWei = node.feePerUnitWei;
            foreignHubs.push({
                tokenId,
                owner: cell.owner,
                feePerUnit: cpuFromWei(perUnitWei.toString()),
                fee: amount === null ? null : cpuFromWei((perUnitWei * amount).toString()),
            });
        }

        const result: PlanRouteResult = {
            waypoints: plan.waypoints,
            legs: plan.legs,
            totalDistance: plan.totalDistance,
            foreignHubs,
            estimatedFee: amount === null ? null : cpuFromWei((plan.feePerUnitWei * amount).toString()),
            estimatedTravelSec: plan.totalDistance * routing.moveTimePerCellSec,
            optimize: input.optimize,
            note: ROUTE_VERIFY_NOTE,
        };
        this.logger.info('route planned', {
            from,
            to,
            waypoints: result.waypoints.length,
            totalDistance: result.totalDistance,
            foreignHubs: foreignHubs.length,
        });
        return result;
    }

    private assertEligible(
        tokenId: string,
        nodes: Map<string, RouteNode>,
        cells: Map<string, CellState>,
        label: string,
    ): void {
        if (nodes.has(tokenId)) {
            return;
        }
        const cell = cells.get(tokenId) ?? null;
        if (cell === null) {
            throw new Error(`${label} cell ${tokenId} is not in the current map (unminted or not yet synced).`);
        }
        if (cell.revealCount === 0) {
            throw new Error(`${label} cell ${tokenId} is not revealed; reveal it first (cpu_reveal).`);
        }
        throw new Error(
            `${label} cell ${tokenId} is not an eligible waypoint: it must be a cell you own or carry a Hub.`,
        );
    }
}
