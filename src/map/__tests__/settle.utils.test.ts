import { describe, expect, it } from 'vitest';

import {
    makeCell,
    makeCraftProcess,
    makeMiningProcess,
    makeProjectionConfig,
    makeResource,
    makeStorage,
} from './fixtures.js';
import { BuildingType } from '../../api/types.js';
import { toCell } from '../cell-view.utils.js';
import { settleCell, veinDrawPerCycle, type SettleConfig } from '../settle.utils.js';
import type { Cell, RawCell, RawCellResource } from '../types.js';

const RESOURCE = 3;
const RECIPE = 'refine';
const DRILL = BuildingType.TungstenDrill;
const OUTPUTS = { [RECIPE]: [{ resourceId: RESOURCE, amount: 100 }] };

function config(overrides: Partial<SettleConfig> = {}): SettleConfig {
    return { craftOutputsByRecipe: OUTPUTS, veinDrainPercentByBuilding: {}, ...overrides };
}

function cell(overrides: Partial<RawCell> = {}, resources: Array<RawCellResource> = []): Cell {
    return toCell(
        makeCell({
            building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
            process: makeMiningProcess({ resource: RESOURCE, yieldPerCycle: 100 }),
            resources,
            ...overrides,
        }),
        0,
        makeProjectionConfig({ craftOutputsByRecipe: OUTPUTS }),
    );
}

const uncapped = (deposit: string) => [makeResource({ resourceId: RESOURCE, deposit, storage: null })];

describe('veinDrawPerCycle', () => {
    it('draws exactly what it yields at 100 percent', () => {
        expect(veinDrawPerCycle(3858, 100)).toBe(3858);
    });

    it.each([
        [80, 3858, 3086],
        [65, 3858, 2507],
        [80, 6429, 5143],
        [65, 6429, 4178],
    ])('draws %s percent of %s as %s', (percent, yieldPerCycle, expected) => {
        expect(veinDrawPerCycle(yieldPerCycle, percent)).toBe(expected);
    });

    it('never draws zero, so a deposit can always be drained', () => {
        expect(veinDrawPerCycle(1, 1)).toBe(1);
    });
});

describe('settleCell mining', () => {
    it('settles every matured cycle when nothing else binds', () => {
        expect(settleCell(cell({}, uncapped('10000')), 5, config())).toEqual({
            settledBatches: 5,
            minedUnits: 500n,
            drainedUnits: 500n,
            depleted: false,
        });
    });

    it('stops at the deposit, draining its last partial cycle in full', () => {
        expect(settleCell(cell({}, uncapped('250')), 5, config())).toEqual({
            settledBatches: 3,
            minedUnits: 250n,
            drainedUnits: 250n,
            depleted: true,
        });
    });

    it('credits a vein-drain extractor more than it drains', () => {
        const drill = cell(
            { building: { type: DRILL, buildFinishAt: null, modeResource: null, modeRecipeId: null } },
            uncapped('400'),
        );
        expect(settleCell(drill, 5, config({ veinDrainPercentByBuilding: { [DRILL]: 80 } }))).toEqual({
            settledBatches: 5,
            minedUnits: 500n,
            drainedUnits: 400n,
            depleted: true,
        });
    });

    it('assumes draw equals yield for a building the config does not name', () => {
        const s = settleCell(cell({}, uncapped('400')), 5, config());
        expect(s.drainedUnits).toBe(400n);
        expect(s.settledBatches).toBe(4);
    });

    it('settles whole cycles only — room for a partial cycle banks nothing', () => {
        const tight = [
            makeResource({ resourceId: RESOURCE, deposit: '10000', storage: makeStorage({ used: '10', cap: '99' }) }),
        ];
        const s = settleCell(cell({}, tight), 5, config());
        expect(s.settledBatches).toBe(0);
        expect(s.minedUnits).toBe(0n);
    });

    it('takes the whole cycles the room admits and no more', () => {
        const room = [
            makeResource({ resourceId: RESOURCE, deposit: '10000', storage: makeStorage({ used: '0', cap: '250' }) }),
        ];
        expect(settleCell(cell({}, room), 5, config())).toEqual({
            settledBatches: 2,
            minedUnits: 200n,
            drainedUnits: 200n,
            depleted: false,
        });
    });

    it('banks nothing when no cycle has matured', () => {
        expect(settleCell(cell({}, uncapped('10000')), 0, config())).toEqual({
            settledBatches: 0,
            minedUnits: 0n,
            drainedUnits: 0n,
            depleted: false,
        });
    });

    it('banks nothing on an empty deposit', () => {
        expect(settleCell(cell({}, uncapped('0')), 5, config())).toEqual({
            settledBatches: 0,
            minedUnits: 0n,
            drainedUnits: 0n,
            depleted: true,
        });
    });
});

describe('settleCell craft', () => {
    it('takes the whole batches every output admits', () => {
        const room = [
            makeResource({ resourceId: RESOURCE, deposit: '0', storage: makeStorage({ used: '0', cap: '250' }) }),
        ];
        const crafting = cell({ process: makeCraftProcess({ recipeId: RECIPE }) }, room);
        expect(settleCell(crafting, 5, config()).settledBatches).toBe(2);
    });

    it('never depletes — a craft has no deposit to drain', () => {
        const crafting = cell({ process: makeCraftProcess({ recipeId: RECIPE }) }, uncapped('0'));
        expect(settleCell(crafting, 5, config())).toEqual({
            settledBatches: 5,
            minedUnits: 0n,
            drainedUnits: 0n,
            depleted: false,
        });
    });
});

describe('settleCell idle', () => {
    it('settles nothing on a cell with no process', () => {
        expect(settleCell(cell({ process: null }, uncapped('10000')), 5, config())).toEqual({
            settledBatches: 0,
            minedUnits: 0n,
            drainedUnits: 0n,
            depleted: false,
        });
    });
});
