export const GET_CHANGES_DESCRIPTION = [
    'Get only the cells that changed since a given version — react to other players without re-reading',
    'the whole map. Workflow: take "version" from a previous map response, remember it, and pass it back',
    'here next time; the response carries a new "version" to use on the following call.',
    'Omit sinceVersion (or pass 0) to get everything.',
    'The response also carries "server": { reachable }. reachable=false means the game server is',
    'unreachable right now (the last HTTP call to the API failed or returned non-JSON), so any action',
    '(build/reveal/transport/trade) will fail too — do not hammer it with retries. Keep polling',
    '`cpu_get_changes` instead: the client keeps probing and reconnecting in the background, and once',
    '"server".reachable flips back to true the server is up and you can act again (after an outage,',
    'call once with sinceVersion 0 to be sure you have the full current picture).',
].join(' ');
