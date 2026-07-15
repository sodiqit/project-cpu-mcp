export const START_MINING_DESCRIPTION = [
    'Start a bounded extraction job on a cell you own that holds a finished extractor. Requires a session —',
    'call `cpu_authenticate` first. Pass the `targetResourceId` to mine — it must be a resource the extractor can',
    'mine (see `cpu_get_game_config`) with an active deposit on the cell; omit it when the extractor mines a',
    'single resource. Costs no $CPU. The building must have finished construction — building takes time after',
    '`cpu_build`. `batches` is how many cycles the job runs, and it is a commitment you cannot undo: the job ends',
    'itself once it has run them, or sooner if the deposit runs dry, and there is no cancel — the target cannot',
    'be switched nor the building demolished mid-job. It never overruns its schedule, so coming back late banks',
    "exactly what you booked and no more. Until the job ends it holds the cell's only process slot, so nothing",
    'can be crafted there; claiming a finished job frees the slot. Size `batches` against the cycle length in',
    '`cpu_get_game_config` and the deposit in `cpu_get_cell` — scheduling past the deposit just ends early.',
    'Track it with `cpu_get_mining_status` and bank matured cycles with `cpu_claim_mining`.',
].join(' ');
