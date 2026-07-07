export const GET_ATTENTION_DESCRIPTION = [
    'Roll up your cells that need action, most urgent first, so you do not have to scan the whole map.',
    'Owner-scoped — requires an authenticated wallet. Flags: stalled mining/craft (a warehouse hit its cap and',
    'production is halted — critical), a warehouse nearing its cap on a resource you are actively producing',
    '(warning), a delivery that has arrived and is ready to finalize (warning), an extractor sitting on a',
    'depleted deposit (warning), and revealed-but-unbuilt cells (info). Each item carries the cell, the',
    'resource, the fill level, the used breakdown (liquid / incoming transport / lots), a `suggestedTool`, and',
    'a one-line action. Optional `minSeverity` filters by urgency. Reads the in-memory map plus your ready',
    'deliveries; if the server is unreachable the delivery section is skipped and a `note` says so.',
].join(' ');
