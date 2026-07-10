import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import { type AppConfigResponse, BuildingKind, BuildingType, CraftRecipeId } from '../../api/types.js';
import { Network } from '../../config/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { AppConfigService } from '../app-config.service.js';

const CPU_HOOK = '0x4444444444444444444444444444444444444444';
const CELL = '0x5555555555555555555555555555555555555555';

class FakeApi {
    public readonly paths: Array<string> = [];

    constructor(private readonly response: { status: number; data: unknown }) {}

    async request(path: string): Promise<{ status: number; data: unknown }> {
        this.paths.push(path);
        return this.response;
    }
}

function makeResponse(overrides: Partial<AppConfigResponse> = {}): AppConfigResponse {
    return {
        network: 'ethereum',
        chainId: 1,
        contracts: {
            land: '0x3333333333333333333333333333333333333333',
            cpuToken: '0x2222222222222222222222222222222222222222',
            cpuHook: CPU_HOOK,
            cell: CELL,
            cellLens: '0x6666666666666666666666666666666666666666',
            transport: '0x7777777777777777777777777777777777777777',
            trade: '0x8888888888888888888888888888888888888888',
            ...overrides.contracts,
        },
        resources: { 5: 'Iron' },
        recipes: [],
        buildings: [
            {
                type: BuildingType.Mine,
                onChainId: 4,
                name: 'Mine',
                kind: BuildingKind.Extractor,
                tier: 1,
                buildCost: '5',
                buildTimeSec: 120,
                buildInputs: [],
                demolishCost: { cpu: '2.5', inputs: [] },
                minableResources: [5, 6],
                recipes: [],
            },
        ],
        reveal: { firstFree: true, reRevealCost: '1000' },
        transport: { moveRadius: 1, hubRadius: 3, moveTimePerCellSec: 2 },
        ...overrides,
    };
}

function makeService(api: FakeApi): AppConfigService {
    return new AppConfigService({
        api: api as unknown as ApiClient,
        network: Network.ETHEREUM,
        logger: new NoopLogger(),
    });
}

describe('AppConfigService', () => {
    it('loads config for the configured network and caches it', async () => {
        const api = new FakeApi({ status: 200, data: makeResponse() });
        const service = makeService(api);

        const first = await service.load();
        const second = await service.load();

        expect(api.paths).toEqual(['/api/v1/config?network=ethereum']);
        expect(first.chainId).toBe(1);
        expect(first.network).toBe(Network.ETHEREUM);
        expect(first.contracts.cell).toBe(CELL);
        expect(first.contracts.cpuHook).toBe(CPU_HOOK);
        expect(first.resources[5]).toBe('Iron');
        expect(second).toBe(first);
    });

    it('passes recipes through and defaults them to an empty array when absent', async () => {
        const recipe = {
            id: CraftRecipeId.SmeltSteel,
            name: 'Smelt Steel',
            tier: 2,
            inputs: [{ resourceId: 5, amount: 4 }],
            outputs: [{ resourceId: 102, amount: 2 }],
            durationSec: 30,
            costCpu: '0',
        };
        const withRecipes = await makeService(
            new FakeApi({ status: 200, data: makeResponse({ recipes: [recipe] }) }),
        ).load();
        expect(withRecipes.recipes).toEqual([recipe]);

        // Addresses may be empty before contracts deploy; config load no longer rejects that.
        const without = await makeService(
            new FakeApi({
                status: 200,
                data: {
                    network: 'ethereum',
                    chainId: 1,
                    contracts: { land: '', cpuToken: '', cpuHook: '', cell: '' },
                    resources: {},
                },
            }),
        ).load();
        expect(without.recipes).toEqual([]);
        expect(without.buildings).toEqual([]);
        expect(without.reveal).toEqual({ firstFree: true, reRevealCost: '0' });
    });

    it('throws on a non-200 config response', async () => {
        const api = new FakeApi({ status: 500, data: {} });
        await expect(makeService(api).load()).rejects.toThrow(/Failed to load chain config/i);
    });
});
