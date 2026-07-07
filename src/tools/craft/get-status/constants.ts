export const GET_CRAFT_STATUS_DESCRIPTION = [
    'Get the craft processes on a cell: each one’s recipe, status (active / pending payment / stalled), batches',
    'done, what is claimable right now, and when the next batch matures. A craft stalls when any output',
    'resource’s warehouse hits its storage cap — matured batches stop until you offload a blocked output',
    '(`blockedResourceIds`). Public — works for any tokenId. This is the source of craft progress; bank matured',
    'batches with `cpu_claim_craft`.',
].join(' ');
