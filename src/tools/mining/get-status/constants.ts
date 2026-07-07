export const GET_MINING_STATUS_DESCRIPTION = [
    "Read a cell's mining status: whether an extractor is active, which resource it mines, the",
    'accrued-but-unclaimed amount, the remaining deposit, and whether mining is stalled because that',
    "resource's warehouse hit its storage cap. Production halts at the cap until you offload — transport it",
    'out, sell via create_lot, craft with it, or withdraw wCPU; a null cap means the warehouse is uncapped.',
    'When stalled, claimable reflects the remaining warehouse room (near zero on a full box). Public — works',
    'for any cell, no session required. The owner banks the accrued amount with `claim_mining`.',
].join(' ');
