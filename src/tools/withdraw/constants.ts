/** Upper bound on a single withdraw — the on-chain `amount` argument is a `uint64`. */
export const WITHDRAW_MAX_UNITS = 2n ** 64n - 1n;

export const WITHDRAW_DESCRIPTION = [
    'Cash out a cell’s wCPU (resource id 1, the Tier-5 CPU Forge output) into the on-chain $CPU token in',
    'your wallet, 1:1. Requires a session — call `cpu_authenticate` first, and you must own the cell. Pass the',
    'amount in whole wCPU units (e.g. "100"), up to the cell’s wCPU balance. This debits the wCPU from the',
    'cell and mints $CPU straight to your wallet, so no $CPU approve is needed; it submits the on-chain',
    'transaction and waits for its confirmation, then reports the tx hash — check the credited $CPU with',
    '`cpu_get_balance`.',
    'wCPU lives on the cell, not your wallet: selling or transferring the cell takes its wCPU with it, so',
    'withdraw before you sell.',
].join(' ');
