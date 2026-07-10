export const QUOTE_TRANSPORT_DESCRIPTION = [
    'Preview a transport route (a waypoint chain of tokenIds) without committing: returns the $CPU transit fee',
    '(decimal), the summed grid distance, and the arrival timestamp. Read-only on-chain view with no side effects.',
    'It also validates the route, surfacing the rejection reason if the chain is invalid (hop out of range,',
    'unrevealed or ineligible waypoint). Scout waypoints with `cpu_next_hops`; use this before `cpu_transport`.',
].join(' ');
