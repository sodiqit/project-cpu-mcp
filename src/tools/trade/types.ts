import { z } from 'zod';

import { LotAvailability, LotSort, LotState } from '../../api/types.js';

const coord = z.object({
    x: z.number().describe('Axial hex x.'),
    y: z.number().describe('Axial hex y.'),
});

const positiveIntString = z
    .string()
    .regex(/^[1-9]\d*$/)
    .describe('A positive integer, as a string (matches on-map unit counts).');

export const createLotInputSchema = {
    chain: z
        .array(coord)
        .min(2)
        .describe(
            '[source, ...waypoints, hub] in axial hex — first node is your source cell, last is the listing Hub. ' +
                'A route through a foreign Hub is paid in $CPU; the API validates the physics.',
        ),
    resourceId: z.number().int().describe('Resource type id to list (must have a balance at the source cell).'),
    value: positiveIntString.describe('Units to list, as a positive integer string.'),
    pricePerUnit: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .describe('Asking price per unit in $CPU (positive decimal string, e.g. "0.5"). Must be > 0.'),
};

export const buyLotInputSchema = {
    lotId: z.string().describe('The lot id to buy from (from list_lots / get_lot / get_markets).'),
    chain: z
        .array(coord)
        .min(2)
        .describe(
            '[hub, ...waypoints, destination] — first node is the lot Hub, last is your own revealed cell where ' +
                'the goods are delivered.',
        ),
    value: positiveIntString.describe('Units to buy, as a positive integer string (≤ the lot remaining).'),
};

export const cancelLotInputSchema = {
    lotId: z.string().describe('The lot id to cancel (must be yours).'),
    chain: z
        .array(coord)
        .min(2)
        .nullable()
        .default(null)
        .describe(
            '[hub, ...waypoints, destination] for the return shipment — REQUIRED to cancel an OPEN lot. DRAFT lots ' +
                'cannot be cancelled manually (they auto-revert once their signature lapses).',
        ),
};

export const quoteBuyInputSchema = {
    lotId: z.string().describe('The lot id to preview a buy on.'),
    value: positiveIntString.describe('Units to buy, as a positive integer string.'),
    chain: z
        .array(coord)
        .min(2)
        .nullable()
        .default(null)
        .describe(
            '[hub, ...waypoints, destination] to include transit fees (the exact total buy_lot would charge); omit ' +
                'for a seller-only estimate (price × value).',
        ),
};

export const listLotsInputSchema = {
    hub: z.number().int().nullable().default(null).describe('Filter to a Hub by its cell token id.'),
    resourceId: z.number().int().nullable().default(null).describe('Filter by resource id.'),
    seller: z.string().nullable().default(null).describe('Filter by seller address.'),
    minPrice: z.string().nullable().default(null).describe('Minimum price per unit ($CPU decimal string).'),
    maxPrice: z.string().nullable().default(null).describe('Maximum price per unit ($CPU decimal string).'),
    availability: z
        .nativeEnum(LotAvailability)
        .nullable()
        .default(null)
        .describe('open (default) | incoming (paid & en route) | all.'),
    sort: z.nativeEnum(LotSort).nullable().default(null).describe('price_asc | recent | nearest.'),
    limit: z.number().int().nullable().default(null).describe('Page size (default 50, max 200).'),
    offset: z.number().int().nullable().default(null).describe('Page offset.'),
    aroundTokenId: z
        .number()
        .int()
        .nullable()
        .default(null)
        .describe('Zone center as a cell token id (alternative to centerX/centerY).'),
    centerX: z.number().int().nullable().default(null).describe('Zone center x (with centerY).'),
    centerY: z.number().int().nullable().default(null).describe('Zone center y (with centerX).'),
    radius: z.number().int().nullable().default(null).describe('Zone radius in hex steps.'),
};

export const marketsInputSchema = {
    hub: z.number().int().nullable().default(null).describe('Filter to a Hub by its cell token id.'),
    resourceId: z.number().int().nullable().default(null).describe('Filter by resource id.'),
    aroundTokenId: z.number().int().nullable().default(null).describe('Zone center as a cell token id.'),
    centerX: z.number().int().nullable().default(null).describe('Zone center x (with centerY).'),
    centerY: z.number().int().nullable().default(null).describe('Zone center y (with centerX).'),
    radius: z.number().int().nullable().default(null).describe('Zone radius in hex steps.'),
};

export const getLotInputSchema = {
    lotId: z.string().describe('The lot id to inspect.'),
};

export const listMyLotsInputSchema = {
    state: z
        .nativeEnum(LotState)
        .nullable()
        .default(null)
        .describe(
            'Optional lifecycle filter (draft, delivering, open, cancel_pending, cancelling, cancelled, reverted). ' +
                'Omit for all.',
        ),
};
