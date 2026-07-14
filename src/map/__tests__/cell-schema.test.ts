import { describe, expect, it } from 'vitest';

import { parseCell } from '../map.utils.js';

function rawCell(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { tokenId: '1', owner: '0xowner', revealCount: 1, resources: [], updated: 1, ...overrides };
}

describe('rawCellSchema fee fields', () => {
    it('defaults both fee records to null when the server omits them', () => {
        const cell = parseCell(rawCell());
        expect(cell).not.toBeNull();
        expect(cell?.transitFeeOverrides).toBeNull();
        expect(cell?.saleFeeOverrides).toBeNull();
    });

    it('distinguishes "not a transit point" (null) from "charges defaults" ({}) for transit fees', () => {
        expect(parseCell(rawCell({ transitFeeOverrides: null }))?.transitFeeOverrides).toBeNull();
        expect(parseCell(rawCell({ transitFeeOverrides: {} }))?.transitFeeOverrides).toEqual({});
    });

    it('keeps per-resource transit overrides as decimal strings', () => {
        const cell = parseCell(rawCell({ transitFeeOverrides: { 5: '0.5', 6: '0' } }));
        expect(cell?.transitFeeOverrides).toEqual({ 5: '0.5', 6: '0' });
    });

    it('converts sale-fee overrides from basis points to percent, preserving a real 0 rate', () => {
        const cell = parseCell(rawCell({ saleFeeOverrides: { 5: 250, 6: 5000, 7: 0 } }));
        expect(cell?.saleFeeOverrides).toEqual({ 5: 2.5, 6: 50, 7: 0 });
    });

    it('reads an empty sale-fee record as a hub-kind building that has set no rates, and null as no hub at all', () => {
        expect(parseCell(rawCell({ saleFeeOverrides: {} }))?.saleFeeOverrides).toEqual({});
        expect(parseCell(rawCell({ saleFeeOverrides: null }))?.saleFeeOverrides).toBeNull();
    });

    it('still drops a structurally invalid cell rather than the whole snapshot', () => {
        expect(parseCell(rawCell({ building: { type: 'not_a_real_building', buildFinishAt: null } }))).toBeNull();
    });
});

describe('rawCellSchema wire shape', () => {
    it('parses a resource whose storage carries no stall flag', () => {
        const cell = parseCell(
            rawCell({
                resources: [
                    {
                        resourceId: 1,
                        deposit: '100',
                        balance: '0',
                        storage: { used: '10', cap: '100', reserved: { incomingTransport: '0', lots: '0' } },
                    },
                ],
            }),
        );

        expect(cell?.resources[0]?.storage).toMatchObject({ used: '10', cap: '100' });
    });

    it('parses a process that carries no stall flag', () => {
        const cell = parseCell(
            rawCell({ process: { kind: 'mining', resource: 1, durationSec: 180, batch: 77, startAt: 1 } }),
        );

        expect(cell?.process).toMatchObject({ resource: 1, batch: 77 });
    });
});
