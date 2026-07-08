export const START_MINING_DESCRIPTION = [
    'Start (or re-target) extraction on a cell you own that holds a finished extractor. Requires a session —',
    'call `cpu_authenticate` first. Pass the `targetResourceId` to mine — it must be a resource the extractor can',
    'mine (see `cpu_get_game_config`) with an active deposit on the cell; omit it when the extractor mines a',
    'single resource. Costs no $CPU. The building must have finished construction — building takes time after',
    '`cpu_build`. A cell runs one process at a time: to switch a switchable extractor to another resource, bank',
    'the current run with `cpu_claim_mining` first, then start again. Track accrual with `cpu_get_mining_status`.',
].join(' ');
