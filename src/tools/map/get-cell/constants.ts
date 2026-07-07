export const GET_CELL_DESCRIPTION = [
    'Inspect one cell in depth (any owner — the map is public). Returns the cell, its neighbours expanded as full',
    'cell states (the immediate surroundings of a target), and the hex distance to your nearest cell (null if your',
    'wallet is unknown). Each resource carries a `storage` box (used/cap/reserved/stalled) and the active process',
    'a `stalled` flag — true when its warehouse is full and production is halted until you offload. For broader',
    'situational awareness use `cpu_get_map`.',
].join(' ');
