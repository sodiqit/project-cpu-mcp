export const QUOTE_TRANSPORT_DESCRIPTION = [
    'Preview a transport route without committing: returns the $CPU transit fee (decimal), the summed hop distance,',
    'and the arrival timestamp. Read-only on-chain view with no side effects. It also validates the route,',
    'surfacing the rejection reason if the path is invalid (unreachable hop, unrevealed or ineligible waypoint).',
    'Use it before `cpu_transport`.',
].join(' ');
