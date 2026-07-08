import { z } from 'zod';

export const miningStatusInputSchema = {
    tokenId: z.string().describe('The tokenId of the cell to inspect mining for.'),
};

export const startMiningInputSchema = {
    tokenId: z.string().describe('The tokenId of a cell you own holding a finished extractor.'),
    targetResourceId: z
        .number()
        .int()
        .nullable()
        .default(null)
        .describe(
            'Resource id to extract — must be one the extractor can mine and have a live deposit on the cell. ' +
                'Omit (null) to auto-pick when the extractor mines a single resource.',
        ),
};

export const claimMiningInputSchema = {
    tokenId: z.string().describe('The tokenId of a cell you own with an extractor, to bank its accrued resources.'),
};
