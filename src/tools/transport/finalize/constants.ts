export const FINALIZE_DELIVERY_DESCRIPTION = [
    'Finalize one or more arrived deliveries by their on-chain deliveryIds, crediting each to its target cell.',
    'Permissionless and on-chain (you pay gas). A delivery can only be finalized once its arrival time has passed',
    '— see `list_my_transports` (ready_to_finalize). Requires a session — call `authenticate` first.',
].join(' ');
