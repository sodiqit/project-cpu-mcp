export const CLAIM_MINING_DESCRIPTION = [
    'Bank every matured mining batch an extractor has produced on a cell you own into its resource balance.',
    'Requires a session — call `cpu_authenticate` first. With an active extractor, claiming when nothing new',
    'has matured is a harmless no-op; claiming on a cell that has no extractor is an error. A cycle in progress',
    'matures nothing until it completes. Check what is available first with `cpu_get_mining_status`.',
].join(' ');
