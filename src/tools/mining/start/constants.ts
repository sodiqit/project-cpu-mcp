export const START_MINING_DESCRIPTION = [
    'Start extraction on a cell you own that holds a finished extractor. Requires a session —',
    'call `cpu_authenticate` first. Pass the `targetResourceId` to mine — it must be a resource the extractor can',
    'mine (see `cpu_get_game_config`) with an active deposit on the cell; omit it when the extractor mines a',
    'single resource. Costs no $CPU. The building must have finished construction — building takes time after',
    '`cpu_build`. Starting is a commitment: the run keeps mining its target until the deposit is exhausted —',
    '`cpu_claim_mining` banks matured batches but does not stop the run, so the target cannot be switched (nor',
    'the building demolished) mid-run. The extractor mines a batch each cycle — track matured batches with',
    '`cpu_get_mining_status` and bank them with `cpu_claim_mining`.',
].join(' ');
