export const GET_ATTENTION_DESCRIPTION = [
    'Roll up the cells worth a look, most time-sensitive first, so you do not have to scan the whole map.',
    'Owner-scoped: your own cells (needs an authenticated wallet) or another player’s via `owner`. Flags:',
    'stalled mining/craft (a warehouse hit its cap and production is halted — critical), a warehouse nearing',
    'its cap on an actively-produced resource (warning), a delivery that has arrived and is ready to finalize',
    '(warning), an extractor sitting on a depleted deposit (warning), and revealed-but-unbuilt cells (info).',
    'Each item is purely descriptive — the cell, the resource, the fill level, the used breakdown (liquid /',
    'incoming transport / lots), deposit, and delivery details — and suggests no action, so you decide what to',
    'do. Optional `minSeverity` filters by urgency. Pass `owner` to scout another player: read-only intel on',
    'their cells (who is stalled, near-full, sitting on idle land, or has goods inbound). Everything here is',
    'public. Reads the in-memory map plus the owner’s ready deliveries; if the server is unreachable the',
    'delivery section is skipped and a `note` says so.',
].join(' ');
