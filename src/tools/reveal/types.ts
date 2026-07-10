import { tokenIdSchema } from '../../geometry/types.js';

export const revealInputSchema = {
    tokenId: tokenIdSchema.transform(String).describe('The tokenId of a cell you own to reveal.'),
};
