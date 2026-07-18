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
import { attentionItem, buildAttentionReport, meetsSeverity, withExtraItems } from '../attention.utils.js';
import { toCell } from '../cell-view.utils.js';
import { AttentionReason, AttentionSeverity, type AttentionItem } from '../types.js';

const BASE = {
    version: 100,
    serverTime: 10,
    nearFullPct: 90,
    craftOutputsByRecipe: {},
    extractionShareBpByBuilding: { [BuildingType.Mine]: 10000 },
    extractorBuildingTypes: new Set<string>([BuildingType.Mine]),
};

function report(cells: Array<Parameters<typeof makeCell>[0]>, craftOutputsByRecipe = {}) {
    const config = makeProjectionConfig({ craftOutputsByRecipe });
    return buildAttentionReport({
        ...BASE,
        craftOutputsByRecipe,
        ownedCells: cells.map((o) => toCell(makeCell(o), BASE.serverTime, config)),
    });
}

describe('buildAttentionReport', () => {
    it('returns an empty, owner-unknown report when the wallet is unknown', () => {
        const r = buildAttentionReport({ ...BASE, ownedCells: null });
        expect(r.ownerKnown).toBe(false);
        expect(r.items).toEqual([]);
        expect(r.counts).toEqual({ critical: 0, warning: 0, info: 0 });
    });

    it('flags stalled mining as critical with the used breakdown', () => {
        const r = report([
            {
                tokenId: '1',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 7 }),
                resources: [
                    makeResource({
                        resourceId: 7,
                        deposit: '1000',
                        balance: '20',
                        storage: makeStorage({
                            used: '50',
                            cap: '50',
                            reserved: { incomingTransport: '30', lots: '0' },
                        }),
                    }),
                ],
            },
        ]);
        expect(r.items).toHaveLength(1);
        const [item] = r.items;
        expect(item?.reason).toBe(AttentionReason.StalledMining);
        expect(item?.severity).toBe(AttentionSeverity.Critical);
        expect(item?.resourceId).toBe(7);
        expect(item?.fillPct).toBe(100);
        expect(item?.breakdown).toEqual({ liquid: '20', incomingTransport: '30', lots: '0' });
    });

    it('flags one stalled_craft item per full output box', () => {
        const r = report(
            [
                {
                    tokenId: '2',
                    revealCount: 1,
                    building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                    process: makeCraftProcess({ recipeId: 'refine' }),
                    resources: [
                        makeResource({
                            resourceId: 10,
                            deposit: '1000',
                            storage: makeStorage({ used: '60', cap: '60' }),
                        }),
                        makeResource({
                            resourceId: 11,
                            deposit: '1000',
                            storage: makeStorage({ used: '60', cap: '60' }),
                        }),
                        // Not an output of this recipe → must not be flagged even though its box is full.
                        makeResource({
                            resourceId: 99,
                            deposit: '1000',
                            storage: makeStorage({ used: '60', cap: '60' }),
                        }),
                    ],
                },
            ],
            {
                refine: [
                    { resourceId: 10, amount: 20 },
                    { resourceId: 11, amount: 20 },
                ],
            },
        );
        const stalled = r.items.filter((i) => i.reason === AttentionReason.StalledCraft);
        expect(stalled.map((i) => i.resourceId).sort()).toEqual([10, 11]);
        expect(r.counts.critical).toBe(2);
    });

    it('flags near-full only for actively produced resources', () => {
        const r = report([
            {
                tokenId: '3',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 5, yieldPerCycle: 5 }),
                resources: [
                    // Mined resource at 95%, still room for a whole cycle → warning, not a stall.
                    makeResource({ resourceId: 5, deposit: '1000', storage: makeStorage({ used: '95', cap: '100' }) }),
                    // A different resource, also 95% but nothing produces it → not flagged.
                    makeResource({ resourceId: 6, deposit: '1000', storage: makeStorage({ used: '95', cap: '100' }) }),
                ],
            },
        ]);
        const nearFull = r.items.filter((i) => i.reason === AttentionReason.WarehouseNearFull);
        expect(nearFull).toHaveLength(1);
        expect(nearFull[0]?.resourceId).toBe(5);
        expect(nearFull[0]?.severity).toBe(AttentionSeverity.Warning);
    });

    it('never flags an uncapped (cap null) warehouse', () => {
        const r = report([
            {
                tokenId: '4',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 1 }),
                resources: [
                    makeResource({
                        resourceId: 1,
                        deposit: '1000',
                        storage: makeStorage({ used: '999999', cap: null }),
                    }),
                ],
            },
        ]);
        expect(r.items).toEqual([]);
    });

    it('flags a built extractor sitting on depleted deposits, but not one mid-construction', () => {
        // A finished extractor keeps a past buildFinishAt (only demolish clears it to null); operational
        // means buildFinishAt <= serverTime (10 here), a future one is still under construction.
        const built = report([
            {
                tokenId: '5',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: 5, modeResource: null, modeRecipeId: null },
                resources: [makeResource({ resourceId: 1, deposit: '0' })],
            },
        ]);
        expect(built.items.map((i) => i.reason)).toContain(AttentionReason.DepositDepleted);
        expect(built.items.find((i) => i.reason === AttentionReason.DepositDepleted)?.depositRemaining).toBe('0');

        const constructing = report([
            {
                tokenId: '6',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: 9_999_999, modeResource: null, modeRecipeId: null },
                resources: [makeResource({ resourceId: 1, deposit: '0' })],
            },
        ]);
        expect(constructing.items).toEqual([]);
    });

    it('flags a job that has run its scheduled cycles, but not one still running', () => {
        const finished = report([
            {
                tokenId: '7',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: 5, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 1, durationSec: 10, batches: 1, startAt: 0 }),
                resources: [makeResource({ resourceId: 1, deposit: '1000' })],
            },
        ]);
        const item = finished.items.find((i) => i.reason === AttentionReason.ProcessFinished);
        expect(item?.severity).toBe(AttentionSeverity.Warning);
        expect(item?.resourceId).toBe(1);

        const running = report([
            {
                tokenId: '8',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: 5, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 1, durationSec: 10, batches: 5, startAt: 0 }),
                resources: [makeResource({ resourceId: 1, deposit: '1000' })],
            },
        ]);
        expect(running.items.map((i) => i.reason)).not.toContain(AttentionReason.ProcessFinished);
    });

    it('flags a job predating bounded mining as finished, since its first claim retires it', () => {
        const r = report([
            {
                tokenId: '9',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: 5, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 1, batches: 0, startAt: 0 }),
                resources: [makeResource({ resourceId: 1, deposit: '1000' })],
            },
        ]);
        expect(r.items.map((i) => i.reason)).toContain(AttentionReason.ProcessFinished);
    });

    it('flags a finished craft too — the schedule is one rule for both kinds', () => {
        const r = report(
            [
                {
                    tokenId: '10',
                    revealCount: 1,
                    building: { type: BuildingType.Mine, buildFinishAt: 5, modeResource: null, modeRecipeId: null },
                    process: makeCraftProcess({ recipeId: 'refine', durationSec: 10, batches: 1, startAt: 0 }),
                    resources: [makeResource({ resourceId: 10, deposit: '1000' })],
                },
            ],
            { refine: [{ resourceId: 10, amount: 20 }] },
        );
        const item = r.items.find((i) => i.reason === AttentionReason.ProcessFinished);
        expect(item?.severity).toBe(AttentionSeverity.Warning);
        expect(item?.resourceId).toBeNull();
    });

    it('flags a revealed cell with no building as info, but not a reveal-pending one', () => {
        const unbuilt = report([{ tokenId: '7', revealCount: 1, building: null }]);
        expect(unbuilt.items).toHaveLength(1);
        expect(unbuilt.items[0]?.reason).toBe(AttentionReason.Unbuilt);
        expect(unbuilt.items[0]?.severity).toBe(AttentionSeverity.Info);

        const pending = report([{ tokenId: '8', revealCount: 1, building: null, revealPending: true }]);
        expect(pending.items).toEqual([]);
    });

    it('flags a just-demolished cell as demolition cooldown rather than unbuilt', () => {
        // serverTime is 10; a future demolishFinishAt means the plot is still locked from rebuilding.
        const cooling = report([{ tokenId: '10', revealCount: 1, building: null, demolishFinishAt: 100 }]);
        expect(cooling.items).toHaveLength(1);
        expect(cooling.items[0]?.reason).toBe(AttentionReason.DemolishCooldown);
        expect(cooling.items[0]?.severity).toBe(AttentionSeverity.Info);
        expect(cooling.items[0]?.arrivalAt).toBe(100);

        // Once the cooldown has elapsed (<= serverTime), it is a plain unbuilt plot again.
        const elapsed = report([{ tokenId: '11', revealCount: 1, building: null, demolishFinishAt: 5 }]);
        expect(elapsed.items[0]?.reason).toBe(AttentionReason.Unbuilt);
    });

    it('does not flag hubs for storage', () => {
        const r = report([
            {
                tokenId: '9',
                revealCount: 1,
                building: { type: BuildingType.Hub, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                resources: [makeResource({ resourceId: 1, storage: makeStorage({ used: '500', cap: '500' }) })],
            },
        ]);
        expect(r.items).toEqual([]);
    });

    it('sorts most-urgent first and counts by severity', () => {
        const r = report([
            { tokenId: 'b', revealCount: 1, building: null },
            {
                tokenId: 'a',
                revealCount: 1,
                building: { type: BuildingType.Mine, buildFinishAt: null, modeResource: null, modeRecipeId: null },
                process: makeMiningProcess({ resource: 1 }),
                resources: [
                    makeResource({
                        resourceId: 1,
                        deposit: '1000',
                        storage: makeStorage({ used: '50', cap: '50' }),
                    }),
                ],
            },
        ]);
        expect(r.items.map((i) => i.severity)).toEqual([AttentionSeverity.Critical, AttentionSeverity.Info]);
        expect(r.counts).toEqual({ critical: 1, warning: 0, info: 1 });
    });
});

describe('lot attention reasons', () => {
    it('grades a frozen lot as warning and an at-risk lot as info', () => {
        expect(attentionItem({ tokenId: 'h' }, AttentionReason.LotFrozen).severity).toBe(AttentionSeverity.Warning);
        expect(attentionItem({ tokenId: 'h' }, AttentionReason.LotAtRisk).severity).toBe(AttentionSeverity.Info);
    });

    it('lets the severity filter keep frozen but drop at-risk at a warning floor', () => {
        expect(meetsSeverity(AttentionSeverity.Warning, AttentionSeverity.Warning)).toBe(true);
        expect(meetsSeverity(AttentionSeverity.Info, AttentionSeverity.Warning)).toBe(false);
    });
});

describe('withExtraItems', () => {
    it('merges extra items, re-sorts, re-counts, and sets the note', () => {
        const base = report([{ tokenId: 'z', revealCount: 1, building: null }]);
        const extra: AttentionItem = {
            tokenId: 'd',
            severity: AttentionSeverity.Warning,
            reason: AttentionReason.DeliveryReady,
            resourceId: 3,
            used: null,
            cap: null,
            fillPct: null,
            breakdown: null,
            depositRemaining: null,
            deliveryId: '77',
            arrivalAt: 1,
            lotId: null,
            message: null,
        };
        const merged = withExtraItems(base, [extra], 'deliveries offline');
        expect(merged.items[0]?.severity).toBe(AttentionSeverity.Warning);
        expect(merged.counts).toEqual({ critical: 0, warning: 1, info: 1 });
        expect(merged.note).toBe('deliveries offline');
    });
});
