import { z } from 'zod';

import { tokenIdSchema } from '../../geometry/types.js';
import { DeliveryFilter, RouteOptimize } from '../../services/types.js';

export const transportInputSchema = {
    path: z
        .array(tokenIdSchema)
        .min(2)
        .describe(
            'Waypoint chain of cell tokenIds [source, ...intermediate, target]. Every waypoint must be revealed ' +
                'and eligible (your own cell, or a Hub); each hop must span at most radius(from)+radius(to) grid ' +
                'steps (a plain cell reaches moveRadius, a Hub hubRadius — see get_game_config transport). ' +
                'Use cpu_plan_route to build a valid chain; the Transport contract validates the route.',
        ),
    resourceId: z.number().int().describe('Resource type id to move (must have a balance at the source cell).'),
    amount: z
        .string()
        .regex(/^[1-9]\d*$/)
        .describe('Units to move, as a positive integer string (matches on-map resource balances).'),
};

export const planRouteInputSchema = {
    from: tokenIdSchema.describe('Source cell tokenId (your revealed cell, or a Hub).'),
    to: tokenIdSchema.describe('Target cell tokenId (your revealed cell, or a Hub).'),
    amount: z
        .string()
        .regex(/^[1-9]\d*$/)
        .nullable()
        .default(null)
        .describe('Units you plan to ship — enables the $CPU fee estimate; omit to plan the chain only.'),
    optimize: z
        .nativeEnum(RouteOptimize)
        .default(RouteOptimize.Cheapest)
        .describe('cheapest = fewest $CPU in foreign-hub fees (then shortest); fastest = shortest distance.'),
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
