// Fallback routing params for servers that do not expose `transport` in GET /api/v1/config yet.
// Must match the deployed contracts' transport config; the on-chain quote is the arbiter either way.
export const FALLBACK_MOVE_RADIUS = 1;
export const FALLBACK_HUB_RADIUS = 3;
export const FALLBACK_MOVE_TIME_PER_CELL_SEC = 2;
