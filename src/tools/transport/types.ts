import { z } from 'zod';

import { DeliveryFilter } from '../../services/types.js';

const coord = z.object({
    x: z.number().describe('Axial hex x.'),
    y: z.number().describe('Axial hex y.'),
});

export const transportInputSchema = {
    path: z
        .array(coord)
        .min(2)
        .describe(
            'Waypoint chain [source, ...intermediate, target] in axial hex coords. Each hop must be within reach, ' +
                'and every waypoint revealed and eligible (your own cell, or a Hub). The Transport contract validates the route.',
        ),
    resourceId: z.number().int().describe('Resource type id to move (must have a balance at the source cell).'),
    amount: z
        .string()
        .regex(/^[1-9]\d*$/)
        .describe('Units to move, as a positive integer string (matches on-map resource balances).'),
};

export const getTransportStatusInputSchema = {
    deliveryId: z.string().describe('The on-chain delivery id (from `transport` or `list_my_transports`).'),
};

export const listMyTransportsInputSchema = {
    filter: z
        .nativeEnum(DeliveryFilter)
        .default(DeliveryFilter.All)
        .describe('Filter your deliveries: all, in_transit, delivered, ready_to_finalize.'),
};

export const finalizeDeliveryInputSchema = {
    ids: z
        .array(z.string())
        .min(1)
        .describe('On-chain delivery ids to finalize (arrived deliveries, from `list_my_transports`).'),
};
