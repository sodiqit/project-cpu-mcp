import { describe, expect, it } from 'vitest';

import { parseCellState } from '../map.utils.js';

function rawCell(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { tokenId: '1', owner: '0xowner', revealCount: 1, resources: [], updated: 1, ...overrides };
}

describe('cellStateSchema fee fields', () => {
    it('defaults both fee records to null when the server omits them (old server survives)', () => {
        const cell = parseCellState(rawCell());
        expect(cell).not.toBeNull();
        expect(cell?.transitFeeOverrides).toBeNull();
        expect(cell?.saleFeeOverrides).toBeNull();
    });

    it('distinguishes "not a transit point" (null) from "charges defaults" ({}) for transit fees', () => {
        expect(parseCellState(rawCell({ transitFeeOverrides: null }))?.transitFeeOverrides).toBeNull();
        expect(parseCellState(rawCell({ transitFeeOverrides: {} }))?.transitFeeOverrides).toEqual({});
    });

    it('keeps per-resource transit overrides as decimal strings', () => {
        const cell = parseCellState(rawCell({ transitFeeOverrides: { 5: '0.5', 6: '0' } }));
        expect(cell?.transitFeeOverrides).toEqual({ 5: '0.5', 6: '0' });
    });

    it('converts sale-fee overrides from basis points to percent, preserving a real 0 rate', () => {
        const cell = parseCellState(rawCell({ saleFeeOverrides: { 5: 250, 6: 5000, 7: 0 } }));
        expect(cell?.saleFeeOverrides).toEqual({ 5: 2.5, 6: 50, 7: 0 });
    });

    it('treats an empty sale-fee record as a Ready hub charging nothing yet', () => {
        expect(parseCellState(rawCell({ saleFeeOverrides: {} }))?.saleFeeOverrides).toEqual({});
        expect(parseCellState(rawCell({ saleFeeOverrides: null }))?.saleFeeOverrides).toBeNull();
    });

    it('still drops a structurally invalid cell rather than the whole snapshot', () => {
        expect(parseCellState(rawCell({ building: { type: 'not_a_real_building', buildFinishAt: null } }))).toBeNull();
    });
});
