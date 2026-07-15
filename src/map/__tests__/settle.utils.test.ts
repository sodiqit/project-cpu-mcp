import { describe, expect, it } from 'vitest';

import { makeCell, makeProjectionConfig, makeResource, makeStorage } from './fixtures.js';
import { toCell } from '../cell-view.utils.js';
import { settleMining, veinDrawPerCycle } from '../settle.utils.js';
import type { CellResource, RawCellResource } from '../types.js';

function resources(...raw: Array<RawCellResource>): Array<CellResource> {
    return toCell(makeCell({ resources: raw }), 0, makeProjectionConfig()).resources;
}

const RESOURCE = 3;

const settle = (overrides: Partial<Parameters<typeof settleMining>[0]> = {}) =>
    settleMining({
        resourceId: RESOURCE,
        yieldPerCycle: 100,
        drawPerCycle: 100,
        maturedBatches: 5,
        depositRemaining: 10_000n,
        resources: resources(makeResource({ resourceId: RESOURCE, deposit: '10000', storage: null })),
        ...overrides,
    });

describe('veinDrawPerCycle', () => {
    it('draws exactly what it yields at 100 percent', () => {
        expect(veinDrawPerCycle(3858, 100)).toBe(3858);
    });

    it.each([
        [8000 / 100, 3858, 3086],
        [6500 / 100, 3858, 2507],
        [80, 6429, 5143],
        [65, 6429, 4178],
    ])('draws %s percent of %s as %s', (percent, yieldPerCycle, expected) => {
        expect(veinDrawPerCycle(yieldPerCycle, percent)).toBe(expected);
    });

    it('never draws zero, so a deposit can always be drained', () => {
        expect(veinDrawPerCycle(1, 1)).toBe(1);
    });
});

describe('settleMining', () => {
    it('settles every matured cycle when nothing else binds', () => {
        expect(settle()).toEqual({ settledBatches: 5, minedUnits: 500n, drainedUnits: 500n, depleted: false });
    });

    it('stops at the deposit, draining its last partial cycle in full', () => {
        const s = settle({
            depositRemaining: 250n,
            resources: resources(makeResource({ resourceId: RESOURCE, deposit: '250', storage: null })),
        });
        expect(s).toEqual({ settledBatches: 3, minedUnits: 250n, drainedUnits: 250n, depleted: true });
    });

    it('credits a vein-drain extractor more than it drains', () => {
        const s = settle({
            drawPerCycle: 80,
            depositRemaining: 400n,
            resources: resources(makeResource({ resourceId: RESOURCE, deposit: '400', storage: null })),
        });
        expect(s).toEqual({ settledBatches: 5, minedUnits: 500n, drainedUnits: 400n, depleted: true });
    });

    it('settles whole cycles only — room for a partial cycle banks nothing', () => {
        const s = settle({
            resources: resources(
                makeResource({
                    resourceId: RESOURCE,
                    deposit: '10000',
                    storage: makeStorage({ used: '10', cap: '99' }),
                }),
            ),
        });
        expect(s.settledBatches).toBe(0);
        expect(s.minedUnits).toBe(0n);
    });

    it('takes the whole cycles the room admits and no more', () => {
        const s = settle({
            resources: resources(
                makeResource({
                    resourceId: RESOURCE,
                    deposit: '10000',
                    storage: makeStorage({ used: '0', cap: '250' }),
                }),
            ),
        });
        expect(s).toEqual({ settledBatches: 2, minedUnits: 200n, drainedUnits: 200n, depleted: false });
    });

    it('banks nothing when no cycle has matured', () => {
        expect(settle({ maturedBatches: 0 })).toEqual({
            settledBatches: 0,
            minedUnits: 0n,
            drainedUnits: 0n,
            depleted: false,
        });
    });

    it('banks nothing on an empty deposit', () => {
        const s = settle({
            depositRemaining: 0n,
            resources: resources(makeResource({ resourceId: RESOURCE, deposit: '0', storage: null })),
        });
        expect(s).toEqual({ settledBatches: 0, minedUnits: 0n, drainedUnits: 0n, depleted: true });
    });
});
