import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import {
    type AppConfigResponse,
    type BuildingView,
    BuildingKind,
    BuildingType,
    CraftRecipeId,
} from '../../api/types.js';
import { Network } from '../../config/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { AppConfigService } from '../app-config.service.js';
import type { CatalogBuildingView } from '../types.js';

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
                modeSwitchCost: '1',
                minableResources: [5, 6],
                recipes: [],
                effects: { cycleTimePercent: 100, veinDrainPercent: 100, inputEfficiency: [] },
            },
        ],
        reveal: { firstFree: true, reRevealCost: '1000' },
        transport: { moveRadius: 1, hubRadius: 3, moveTimePerCellSec: 2, defaultMoveFeePerUnit: '0.1' },
        trade: { saleBurnPercent: 1, maxSaleFeeBp: 5000 },
        storage: { hubStorageMultiplier: 10 },
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

describe('AppConfigService mode switch cost', () => {
    async function loadBuilding(modeSwitchCost: string | null | undefined): Promise<CatalogBuildingView> {
        const base = makeResponse();
        const [mine] = base.buildings;
        const row = { ...(mine as BuildingView), modeSwitchCost } as BuildingView;
        if (modeSwitchCost === undefined) {
            delete (row as Partial<BuildingView>).modeSwitchCost;
        }
        const config = await makeService(new FakeApi({ status: 200, data: { ...base, buildings: [row] } })).load();
        return config.buildings[0] as CatalogBuildingView;
    }

    it('reads a catalog that predates the field as unknown — not as impossible, and never as zero', async () => {
        const building = await loadBuilding(undefined);

        expect(building.modeSwitch).toEqual({ kind: 'unknown' });
    });

    it('states "can never switch" positively and carries no price field at all for it', async () => {
        const building = await loadBuilding(null);

        expect(building.modeSwitch).toEqual({ kind: 'impossible' });
        expect('costCpu' in building.modeSwitch).toBe(false);
        expect(JSON.stringify(building.modeSwitch)).not.toMatch(/costCpu/);
    });

    it('carries the price inside the possible tag, keeping the raw field alongside it', async () => {
        const building = await loadBuilding('2');

        expect(building.modeSwitch).toEqual({ kind: 'possible', costCpu: '2' });
        expect(building.modeSwitchCost).toBe('2');
    });
});

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
        expect(first.transport.defaultMoveFeePerUnit).toBe('0.1');
        expect(first.trade).toEqual({ saleBurnPercent: 1, maxSaleFeePercent: 50 });
        expect(first.storage).toEqual({ hubStorageMultiplier: 10 });
        expect(second).toBe(first);
    });

    it('defaults the trade block and default move fee when an older API omits them', async () => {
        const without = await makeService(
            new FakeApi({
                status: 200,
                data: {
                    network: 'ethereum',
                    chainId: 1,
                    contracts: { land: '', cpuToken: '', cpuHook: '', cell: '' },
                    resources: {},
                    storage: { hubStorageMultiplier: 10 },
                },
            }),
        ).load();
        expect(without.trade).toEqual({ saleBurnPercent: 0, maxSaleFeePercent: 0 });
        expect(without.transport.defaultMoveFeePerUnit).toBe('0');
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
                    storage: { hubStorageMultiplier: 10 },
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

    it('has no client-side default for the storage multiplier and fails loudly when the API omits it', async () => {
        const { storage: _storage, ...withoutStorage } = makeResponse();
        const api = new FakeApi({ status: 200, data: withoutStorage });
        await expect(makeService(api).load()).rejects.toThrow();
    });
});
