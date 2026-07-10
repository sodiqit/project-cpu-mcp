// The world grid is a fixed sphere (Goldberg GP(70,0)): 10 rhombus faces of 70×70 lattice points.
// These values must match the deployed contracts' grid; they only change with a world redeploy.
export const GRID_FREQUENCY = 70;

export const RHOMBUS_COUNT = 10;

export const HEXES_PER_RHOMBUS = GRID_FREQUENCY * GRID_FREQUENCY - 1;

export const HEX_COUNT = RHOMBUS_COUNT * HEXES_PER_RHOMBUS;

export const MIN_TOKEN_ID = 1;

export const MAX_TOKEN_ID = HEX_COUNT;

// Fixed slot width of the packed adjacency table; 0 pads the 60 five-neighbor cells.
export const NEIGHBOR_SLOTS = 6;

// Cap for client-side BFS scans; matches the server's trade-zone radius clamp.
export const MAX_ROUTE_RADIUS = 50;
