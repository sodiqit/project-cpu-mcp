import { z } from 'zod';

import { AttentionSeverity } from '../../../map/types.js';

export const getAttentionInputSchema = {
    minSeverity: z
        .nativeEnum(AttentionSeverity)
        .nullable()
        .default(null)
        .describe('Only return items at or above this urgency (critical > warning > info). Default: all.'),
};
