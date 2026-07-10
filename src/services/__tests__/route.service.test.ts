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
            own('75'),
            own('76'),
        ];

        const result = await survey(cells, 72);

        expect(result.fromIsHub).toBe(true);
        expect(result.hops.map((h) => h.tokenId)).toEqual(['75']);
        expect(result.hops[0]?.hopDistance).toBe(3);
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

describe('RouteService.network', () => {
    it('returns nodes with facts, legal edges and component labels', async () => {
        const cells = [own('72'), own('73'), foreignHub('75', '0.5'), own('220'), own('221')];

        const result = await makeService(cells).network({ from: null, towards: null });

        expect(result.nodes.map((n) => n.tokenId)).toEqual(['72', '73', '75', '220', '221']);
        expect(result.edges).toEqual([
            { a: '72', b: '73', distance: 1 },
            { a: '72', b: '75', distance: 3 },
            { a: '73', b: '75', distance: 2 },
            { a: '220', b: '221', distance: 1 },
        ]);
        expect(result.components).toBe(2);
        const byToken = new Map(result.nodes.map((n) => [n.tokenId, n]));
        expect(byToken.get('72')?.component).toBe(byToken.get('75')?.component);
        expect(byToken.get('220')?.component).not.toBe(byToken.get('72')?.component);
        expect(byToken.get('75')).toMatchObject({ isHub: true, transitFeePerUnit: '0.5', owner: RIVAL });
        expect(byToken.get('73')?.pos).toEqual({ face: 0, i: 1, j: 3 });
    });

    it('annotates distance fields when from/towards are given', async () => {
        const cells = [own('72'), own('73'), foreignHub('75', '0.5'), own('78')];

        const result = await makeService(cells).network({ from: 72, towards: 78 });

        expect(result.fromToTarget).toBe(6);
        const byToken = new Map(result.nodes.map((n) => [n.tokenId, n]));
        expect(byToken.get('75')).toMatchObject({ distFromSource: 3, distToTarget: 3 });
        expect(byToken.get('73')).toMatchObject({ distFromSource: 1, distToTarget: 5 });
        expect(byToken.get('72')).toMatchObject({ distFromSource: 0, distToTarget: 6 });
    });

    it('a single foreign cell between plain cells is a wall; a hub reaches across', async () => {
        const rival = makeCell({ tokenId: '73', owner: RIVAL, revealCount: 1 });

        const walled = await makeService([own('72'), rival, own('74')]).network({ from: null, towards: null });
        expect(walled.nodes.map((n) => n.tokenId)).toEqual(['72', '74']);
        expect(walled.edges).toEqual([]);
        expect(walled.components).toBe(2);

        const hub72 = makeCell({
            tokenId: '72',
            owner: WALLET_ADDRESS,
            revealCount: 1,
            building: { type: BuildingType.Hub, buildFinishAt: null },
        });
        const bridged = await makeService([hub72, rival, own('74')]).network({ from: null, towards: null });
        expect(bridged.edges).toEqual([{ a: '72', b: '74', distance: 2 }]);
        expect(bridged.components).toBe(1);
    });

    it('shows a disconnected target as a separate component', async () => {
        const cells = [own('72'), own('73'), own('220')];

        const result = await makeService(cells).network({ from: 72, towards: 220 });

        const byToken = new Map(result.nodes.map((n) => [n.tokenId, n]));
        expect(byToken.get('72')?.component).not.toBe(byToken.get('220')?.component);
        expect(result.fromToTarget).toBeGreaterThan(0);
    });
});
