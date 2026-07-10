import { describe, expect, it } from 'vitest';

import { FakeAppConfig, makeConfig, WALLET_ADDRESS } from './service-fakes.js';
import { BuildingType } from '../../api/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { makeCell } from '../../map/__tests__/fixtures.js';
import type { CellState } from '../../map/types.js';
import type { WalletProvider } from '../../wallet/types.js';
import { RouteService } from '../route.service.js';
import { RouteOptimize } from '../types.js';

const RIVAL = '0x000000000000000000000000000000000000beef';

function own(tokenId: string, over: Partial<CellState> = {}): CellState {
    return makeCell({ tokenId, owner: WALLET_ADDRESS, revealCount: 1, ...over });
}

function foreignHub(tokenId: string, feePerUnit: string): CellState {
    return makeCell({
        tokenId,
        owner: RIVAL,
        revealCount: 1,
        building: { type: BuildingType.Hub, buildFinishAt: null },
        transitFeePerUnit: feePerUnit,
    });
}

function makeService(cells: Array<CellState>): RouteService {
    const wallet = { get: () => ({ getAddress: () => WALLET_ADDRESS }) } as unknown as WalletProvider;
    return new RouteService({
        wallet,
        appConfig: new FakeAppConfig(makeConfig()),
        mapReader: { allCells: () => cells },
        logger: new NoopLogger(),
    });
}

function plan(cells: Array<CellState>, from: string, to: string, optimize = RouteOptimize.Cheapest) {
    return makeService(cells).plan({ from, to, amount: '100', optimize });
}

describe('RouteService.plan', () => {
    it('routes two adjacent own cells directly with no fee', async () => {
        const result = await plan([own('72'), own('73')], '72', '73');

        expect(result.waypoints).toEqual(['72', '73']);
        expect(result.legs).toEqual([{ from: '72', to: '73', distance: 1 }]);
        expect(result.totalDistance).toBe(1);
        expect(result.foreignHubs).toEqual([]);
        expect(result.estimatedFee).toBe('0');
        expect(result.estimatedTravelSec).toBe(2);
    });

    it('bridges an out-of-reach gap through a foreign hub and prices its fee', async () => {
        const result = await plan([own('72'), own('78'), foreignHub('75', '0.5')], '72', '78');

        expect(result.waypoints).toEqual(['72', '75', '78']);
        expect(result.totalDistance).toBe(6);
        expect(result.foreignHubs).toEqual([{ tokenId: '75', owner: RIVAL, feePerUnit: '0.5', fee: '50' }]);
        expect(result.estimatedFee).toBe('50');
        expect(result.estimatedTravelSec).toBe(12);
    });

    it('throws an actionable error when no chain exists', async () => {
        await expect(plan([own('72'), own('78')], '72', '78')).rejects.toThrow(/No valid waypoint chain/);
    });

    it('prefers a fee-free own-cell detour when optimizing for cost, and the shorter paid route when optimizing for speed', async () => {
        const cells = [own('72'), own('76'), foreignHub('74', '0.5'), own('143'), own('144'), own('145'), own('146')];

        const cheapest = await plan(cells, '72', '76', RouteOptimize.Cheapest);
        expect(cheapest.estimatedFee).toBe('0');
        expect(cheapest.foreignHubs).toEqual([]);
        expect(cheapest.totalDistance).toBe(5);

        const fastest = await plan(cells, '72', '76', RouteOptimize.Fastest);
        expect(fastest.totalDistance).toBe(4);
        expect(fastest.waypoints).toEqual(['72', '74', '76']);
        expect(fastest.estimatedFee).toBe('50');
    });

    it('skips the fee estimate when no amount is given', async () => {
        const result = await makeService([own('72'), own('78'), foreignHub('75', '0.5')]).plan({
            from: '72',
            to: '78',
            amount: null,
            optimize: RouteOptimize.Cheapest,
        });

        expect(result.estimatedFee).toBeNull();
        expect(result.foreignHubs[0]?.fee).toBeNull();
        expect(result.foreignHubs[0]?.feePerUnit).toBe('0.5');
    });

    it('rejects ineligible or unknown endpoints with specific errors', async () => {
        const cells = [
            own('72'),
            makeCell({ tokenId: '73', owner: RIVAL, revealCount: 1 }),
            own('74', { revealCount: 0 }),
        ];

        await expect(plan(cells, '72', '99')).rejects.toThrow(/not in the current map/);
        await expect(plan(cells, '72', '73')).rejects.toThrow(/not an eligible waypoint/);
        await expect(plan(cells, '72', '74')).rejects.toThrow(/not revealed/);
        await expect(plan(cells, '72', '72')).rejects.toThrow(/must be different/);
        await expect(plan(cells, 'abc', '73')).rejects.toThrow(/tokenId must be an integer/);
    });
});
