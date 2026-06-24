export const CANCEL_LOT_DESCRIPTION = [
    'Withdraw an OPEN lot; unsold units return to you. Requires a session.',
    'Pass chain = [hub, ...waypoints, your destination cell] (the return shipment). A return through a foreign',
    'Hub costs $CPU — auto-approved and paid on-chain — otherwise it is free. Track with `list_my_lots` /',
    '`get_lot`. A DRAFT lot (one still en route to its Hub, never opened) cannot be cancelled manually — it',
    'auto-reverts once its signature lapses; just wait for it to clear.',
].join(' ');
