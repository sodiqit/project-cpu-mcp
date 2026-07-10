import { describe, expect, it } from 'vitest';

import { FakeAppConfig, makeConfig, WALLET_ADDRESS } from './service-fakes.js';
import { BuildingType } from '../../api/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { makeCell } from '../../map/__tests__/fixtures.js';
import type { CellState } from '../../map/types.js';
import type { WalletProvider } from '../../wallet/types.js';
import { RouteService } from '../route.service.js';

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

function survey(cells: Array<CellState>, from: number, towards: number | null = null) {
    return makeService(cells).nextHops({ from, towards });
}

describe('RouteService.nextHops', () => {
    it('lists own cells within cell reach and hubs within hub reach, with their facts', async () => {
        const cells = [own('72'), own('73'), own('76'), foreignHub('75', '0.5')];

        const result = await survey(cells, 72);

        expect(result.from).toBe('72');
        expect(result.fromIsHub).toBe(false);
        expect(result.reach).toEqual({ moveRadius: 1, hubRadius: 3 });
        expect(result.hops.map((h) => h.tokenId)).toEqual(['73', '75']);
        expect(result.hops[0]).toMatchObject({ tokenId: '73', hopDistance: 1, isOwn: true, transitFeePerUnit: null });
        expect(result.hops[1]).toMatchObject({
            tokenId: '75',
            hopDistance: 3,
            isHub: true,
            owner: RIVAL,
            transitFeePerUnit: '0.5',
        });
        expect(result.hops[1]?.pos).toEqual({ face: 0, i: 1, j: 5 });
    });

    it('adds a compass when towards is given and sorts by remaining distance', async () => {
        const cells = [own('72'), own('73'), own('78'), foreignHub('75', '0.5')];

        const result = await survey(cells, 72, 78);

        expect(result.targetDistance).toBe(6);
        expect(result.hops.map((h) => h.tokenId)).toEqual(['75', '73']);
        expect(result.hops[0]?.distanceToTarget).toBe(3);
        expect(result.hops[1]?.distanceToTarget).toBe(5);
    });

    it('returns an empty list when nothing is within reach — the agent decides what to do', async () => {
        const result = await survey([own('72'), own('78')], 72, 78);

        expect(result.hops).toEqual([]);
        expect(result.targetDistance).toBe(6);
    });

    it('reaches farther when surveying from a hub', async () => {
        const cells = [
            makeCell({
                tokenId: '72',
                owner: WALLET_ADDRESS,
                revealCount: 1,
                building: { type: BuildingType.Hub, buildFinishAt: null },
            }),
            own('76'),
        ];

        const result = await survey(cells, 72);

        expect(result.fromIsHub).toBe(true);
        expect(result.hops.map((h) => h.tokenId)).toEqual(['76']);
        expect(result.hops[0]?.hopDistance).toBe(4);
    });

    it('rejects ineligible or unknown origins with specific errors', async () => {
        const cells = [
            own('72'),
            makeCell({ tokenId: '73', owner: RIVAL, revealCount: 1 }),
            own('74', { revealCount: 0 }),
        ];

        await expect(survey(cells, 99)).rejects.toThrow(/not in the current map/);
        await expect(survey(cells, 73)).rejects.toThrow(/not an eligible waypoint/);
        await expect(survey(cells, 74)).rejects.toThrow(/not revealed/);
        await expect(survey(cells, 72, 72)).rejects.toThrow(/must be different/);
    });
});
