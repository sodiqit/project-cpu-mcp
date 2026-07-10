import { z } from 'zod';

import { MAX_TOKEN_ID, MIN_TOKEN_ID } from './constants.js';

export interface CellCoord {
    face: number;
    i: number;
    j: number;
}

export const tokenIdStringSchema = z
    .string()
    .regex(/^[1-9][0-9]*$/, 'tokenId must be a positive integer string')
    .refine((value) => value.length <= 5 && Number(value) <= MAX_TOKEN_ID, {
        message: `tokenId must be an integer in [${MIN_TOKEN_ID}, ${MAX_TOKEN_ID}]`,
    });
