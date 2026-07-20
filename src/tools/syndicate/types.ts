import { z } from 'zod';

import { SyndicateSort } from '../../api/types.js';

export const listSyndicatesInputSchema = {
    name: z.string().nullable().default(null).describe('Filter by name (substring match).'),
    minMembers: z
        .number()
        .int()
        .min(0)
        .nullable()
        .default(null)
        .describe('Only syndicates with at least this many members.'),
    maxMembers: z
        .number()
        .int()
        .min(0)
        .nullable()
        .default(null)
        .describe('Only syndicates with at most this many members.'),
    sort: z
        .nativeEnum(SyndicateSort)
        .nullable()
        .default(null)
        .describe('members_desc (largest first) | recent (newest first) | name (A→Z).'),
    limit: z.number().int().min(1).nullable().default(null).describe('Page size.'),
    offset: z.number().int().min(0).nullable().default(null).describe('Page offset.'),
};

export const getSyndicateInputSchema = {
    id: z.string().describe('The syndicate id (from cpu_list_syndicates).'),
    membersLimit: z.number().int().min(1).nullable().default(null).describe('Members page size.'),
    membersOffset: z.number().int().min(0).nullable().default(null).describe('Members page offset.'),
};

export const getSyndicateMembershipInputSchema = {
    address: z
        .string()
        .nullable()
        .default(null)
        .describe('Wallet address to look up; omit to check your own membership.'),
};

export const joinSyndicateInputSchema = {
    id: z.string().describe('The syndicate id to join (from cpu_list_syndicates).'),
};

export const leaveSyndicateInputSchema = {};
