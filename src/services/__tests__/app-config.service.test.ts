import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import { type AppConfigResponse, BuildingType, CraftCategory, CraftRecipeId } from '../../api/types.js';
import { Network } from '../../config/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { AppConfigService } from '../app-config.service.js';

const GAME_SETTLEMENT = '0x1111111111111111111111111111111111111111';
const CPU_HOOK = '0x4444444444444444444444444444444444444444';

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
            gameSettlement: GAME_SETTLEMENT,
            cpuHook: CPU_HOOK,
            ...overrides.contracts,
        },
        resources: { 3: 'Silica' },
        recipes: [],
        buildings: [{ type: BuildingType.Extractor, name: 'Extractor', buildCost: '2000' }],
        reveal: { firstFree: true, reRevealCost: '1000' },
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
        expect(first.contracts.gameSettlement).toBe(GAME_SETTLEMENT);
        expect(first.contracts.cpuHook).toBe(CPU_HOOK);
        expect(first.resources[3]).toBe('Silica');
        expect(second).toBe(first);
    });

    it('passes recipes through and defaults them to an empty array when absent', async () => {
        const recipe = {
            id: CraftRecipeId.GeneratePower,
            name: 'Generate Power',
            category: CraftCategory.Refine,
            tier: 2,
            inputs: [{ resourceId: 6, amount: 5 }],
            outputs: [{ resourceId: 101, amount: 10 }],
            durationSec: 30,
            costCpu: '0',
        };
        const withRecipes = await makeService(
            new FakeApi({ status: 200, data: makeResponse({ recipes: [recipe] }) }),
        ).load();
        expect(withRecipes.recipes).toEqual([recipe]);

        const without = await makeService(
            new FakeApi({
                status: 200,
                data: {
                    network: 'ethereum',
                    chainId: 1,
                    contracts: { land: '', cpuToken: '', gameSettlement: GAME_SETTLEMENT, cpuHook: '' },
                    resources: {},
                },
            }),
        ).load();
        expect(without.recipes).toEqual([]);
        expect(without.buildings).toEqual([]);
        expect(without.reveal).toEqual({ firstFree: true, reRevealCost: '0' });
    });

    it('throws when the GameSettlement address is not yet deployed (empty string)', async () => {
        const api = new FakeApi({
            status: 200,
            data: makeResponse({ contracts: { land: '', cpuToken: '', gameSettlement: '', cpuHook: '' } }),
        });
        await expect(makeService(api).load()).rejects.toThrow(/not configured/i);
    });

    it('throws on a non-200 config response', async () => {
        const api = new FakeApi({ status: 500, data: {} });
        await expect(makeService(api).load()).rejects.toThrow(/Failed to load chain config/i);
    });
});
