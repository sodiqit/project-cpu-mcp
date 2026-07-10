import { z } from 'zod';

import { MAX_TOKEN_ID, MIN_TOKEN_ID } from './constants.js';

// Position of a cell on the sphere: rhombus face 0..9 and lattice offsets i,j in [0, 70).
// (0,0) is a pentagon vertex, not a cell. Useful only as a coarse orientation hint — the lattice
// wraps across face seams, so |Δi|+|Δj| is NOT a distance metric near them.
export interface CellCoord {
    face: number;
    i: number;
    j: number;
}

// Shared input schema for anything that names a cell: a decimal-string tokenId in [1, 48990].
export const tokenIdStringSchema = z
    .string()
    .regex(/^[1-9][0-9]*$/, 'tokenId must be a positive integer string')
    .refine((value) => value.length <= 5 && Number(value) <= MAX_TOKEN_ID, {
        message: `tokenId must be an integer in [${MIN_TOKEN_ID}, ${MAX_TOKEN_ID}]`,
    });
