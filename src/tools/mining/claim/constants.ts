export const CLAIM_MINING_DESCRIPTION = [
    'Bank the resources an extractor has accrued on a cell you own into the cell balance. Requires a',
    'session — call `cpu_authenticate` first. Off-chain and free (no transaction). With an active extractor,',
    'claiming nothing accrued is a harmless no-op; claiming on a cell that has no extractor is an error.',
    'Check what is available first with `cpu_get_mining_status`.',
].join(' ');
