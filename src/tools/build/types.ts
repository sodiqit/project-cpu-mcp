import { z } from 'zod';

import { BuildingType } from '../../api/types.js';

export const buildInputSchema = {
    tokenId: z.string().describe('The tokenId of a revealed cell you own to build on.'),
    buildingType: z.nativeEnum(BuildingType).describe('extractor (mines a resource deposit) or hub (trade).'),
    targetResourceId: z
        .number()
        .int()
        .nullable()
        .default(null)
        .describe(
            'For an extractor, the resource id (2–13) to mine — it must have an active deposit on the cell. ' +
                'Must be null for a hub.',
        ),
};

export const demolishInputSchema = {
    tokenId: z.string().describe('The tokenId of a cell you own whose building to remove.'),
};
