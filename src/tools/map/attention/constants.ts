export const GET_ATTENTION_DESCRIPTION = [
    'Owner-scoped roll-up of cells worth attention, most time-sensitive first — so you skip scanning the whole',
    'map. Flags, each with a severity: stalled mining/craft (the output box has room for less than one whole',
    'cycle, so nothing settles and the wait burns — critical); a near-full warehouse on an actively-produced',
    'resource, a job that has run its scheduled cycles and now idles the cell until claimed, an arrived delivery',
    'ready to finalize, or an extractor on a depleted deposit (warning); revealed-but-unbuilt cells, and cells in',
    'a post-demolish rebuild cooldown (info — on a `demolish_cooldown` item `arrivalAt` marks when rebuild',
    'reopens). A finished job loses nothing by waiting, unlike a stall — it only holds the cell idle. Items are',
    'purely descriptive (cell, resource, used/cap breakdown, deposit, delivery) and suggest no action — you',
    'decide. Your own cells need an authenticated wallet; pass `owner` to scout another player read-only (all',
    'data is public). `minSeverity` filters by urgency. If the deliveries endpoint is down, map items still',
    'return and a `note` says so.',
].join(' ');
