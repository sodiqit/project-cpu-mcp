export const GET_GAME_CONFIG_DESCRIPTION = [
    'Return the game rulebook for the active network: the resource catalog (id → name), the building catalog',
    '(name, kind — extractor/crafter/hub — and $CPU cost; the full JSON also carries each building’s mine/craft',
    'bindings and build time), reveal-cost params (first reveal free; re-reveal price), the on-chain contract',
    'addresses, and the recipe count (use `cpu_list_recipes` for the full recipe graph). A free reference read —',
    'call it once to ground planning. No session needed.',
].join(' ');
