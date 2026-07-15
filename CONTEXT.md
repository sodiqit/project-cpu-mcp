# Context & glossary

Shared vocabulary for this MCP server. Everything here is described against the public surfaces the
client consumes — the deployed contracts (their ABIs and events), the game API (`GET /api/v1/config`,
the trade/map endpoints), and the MCP tools — never against any backend internals.

## Readiness

A building takes time to go up, and until it finishes it stands on the cell without yet acting like
the thing it is. These terms govern that transition; the fee and storage vocabulary below builds on
them.

- **Ready** — a building whose construction has finished, judged against the map's own server clock
  rather than your machine's. A bare cell with nothing built has nothing to be ready. A cell surfaces
  this as a three-way `ready` value — `null` (no building), `false` (under construction), `true`
  (finished) — so a fresh waypoint, a building going up, and a finished building never collapse into
  one flag.
- **Active hub** — a hub-kind building (any hub kind, including an upgrade) that is Ready. The mere
  presence of a hub grants nothing by itself: only an active hub multiplies storage, charges transit
  and sale fees, and makes its cell usable as a routing waypoint on the strength of being a hub.
- **Base cap** — a resource's per-cell storage ceiling before any hub applies. Absent (`null`) for a
  resource that has no cap at all.
- **Effective cap** — what a cell's warehouse is actually measured against: the base cap, multiplied
  while the cell carries an active hub. This is the only cap ever surfaced to the agent — in
  `cpu_get_cell`, `cpu_get_map`, and everywhere else a resource's storage appears.
- **Full** — a warehouse at or over its effective cap. A storage fact, not a process state: a Full box
  always Stalls whatever produces into it, but a Process Stalls well before Full — its room only has to
  fall below one whole Cycle's output.
  *Avoid*: stalled (that names the Process state).

## Processes

A cell runs one job at a time, and that job is bounded: its length is chosen when it starts and it never
produces past it. Mining and crafting differ in what they consume, not in how they are scheduled.

- **Process** — the single mining-or-craft job on a cell, bounded by its Batches. It ends itself once it
  has run them; mining also ends early when its deposit empties. There is no cancel, and a claim does not
  stop a running job. Until it ends it holds the cell's only process slot; claiming an ended one frees it.
- **Cycle** — one production tick of a Process (`durationSec`). Mining draws Draw per cycle from the
  deposit and credits Yield per cycle to the warehouse; a craft runs one recipe batch.
- **Batches** — the number of Cycles a Process was scheduled for, chosen at start (both kinds) and capped
  at 1000. `claimedBatches` counts those already banked, absolute rather than a delta.
- **Yield per cycle** — output units one mining Cycle credits.
  *Avoid*: batch (in this meaning).
- **Draw per cycle** — deposit units one mining Cycle removes. Equal to Yield per cycle except on the
  upgraded extractors, whose vein-drain effect takes less out of the ground than it credits — so those
  deposits outlive what Yield per cycle alone suggests. Derived from the building's
  `effects.veinDrainPercent` in `cpu_get_game_config`; it is not on the map.
- **Stall** — a Process whose matured Cycles cannot settle because the room holds less than one whole
  Cycle's output. Claims settle in whole Cycles, so a partial cycle's worth of room banks nothing. Stalled
  time is discarded — the cursor resets to the moment of the settle and the remaining Batches start
  producing from zero — but the schedule itself is never lost. Only time is.
  *Avoid*: pause, idle.
- **Cursor** — a Process's `startAt`: the point its next Cycle is measured from, not the moment it was
  started. Every claim moves it forward past the Cycles it banked, and a Stalled one resets it to now.

## Fees

All fee rates on the MCP surface are expressed in **percent**. The contracts and the game API express
them in **basis points** (1 bp = 0.01%, 100 bp = 1%); the client converts at that boundary
(`bpToPercent` / `percentToBp` in `src/utils/format.utils.ts`) and rejects a rate finer than one whole
basis point.

- **Sale fee** — a hub owner's per-resource share of every sale settled on their hub, carved out of the
  seller's proceeds (the buyer is unaffected — they still pay exactly `pricePerUnit × value`). Structural
  cap: 50%. Set your own with `cpu_set_sale_fee` — including while your hub is still under construction,
  so the rate is already in force the moment it becomes Ready. Read another hub's live rate in
  `cpu_get_markets` (per row); `cpu_get_cell` shows the hub's full rate intent per resource regardless of
  readiness (see Readiness).
- **Fee snapshot** — the hub's live sale-fee rate for a resource, *frozen into a lot at listing*. A lot
  settles every future buy against its own snapshot; later rate changes or a change of hub ownership never
  re-price an existing lot. Surfaced as `saleFeePercent` in lot reads and the create-lot result.
- **Seller tolerance** — the highest sale-fee rate a seller will accept at listing time
  (`cpu_create_lot`'s `maxSaleFeePercent`). When omitted, the client reads the hub's live rate on-chain and
  passes *that* as the tolerance, so a rate raised between the decision and the transaction landing reverts
  the listing (`SaleFeeExceedsMax`) instead of silently freezing a worse rate in.
- **Sale burn** — the protocol's share of every sale, removed from supply. Config: `trade.saleBurnPercent`.
  The buy result reports the actual `burn` and `hubFee` amounts carved out of the sale.
- **Live rate** — a hub's *current* on-chain sale-fee rate, as opposed to the fee snapshot frozen into a
  given lot. `cpu_get_markets`' `liveSaleFeePercent` is enriched locally from the world map and is advisory
  (it may trail the chain by moments); the authoritative protections are the on-chain tolerance check at
  listing and the frozen snapshot in lot reads.

## Transit fees

Charged by a foreign transit hub to route a shipment through it (distinct from the sale fee). Expressed in
**$CPU per unit** (decimal).

- **Transit fee override** — a hub's per-resource per-unit rate for one resource (`transitFeeOverrides` on
  a cell: `resourceId → decimal $CPU`).
- **Transit fee default** — the config rate a transit cell charges for a resource it has no override for
  (`transport.defaultMoveFeePerUnit`).
- **Effective transit fee** — what a shipment of a given resource actually pays through a hub:
  `override ?? default`. The route tools (`cpu_route_network`, `cpu_next_hops`) require a `resourceId` and
  report this exact effective rate per foreign-hub waypoint; the on-chain transport quote remains the
  authority for a routed total.

On a cell, `transitFeeOverrides` and `saleFeeOverrides` each report an *intent*, not a live rate: the
game API serves both maps for any hub-kind building, including one still under construction, so an
owner can set rates ahead of time and have them take effect the moment the hub becomes Ready. `null` in
either map means only **no hub-kind building at all** on the cell — nothing more. An *empty* map (`{}`)
means a hub — Ready or not — charging the default for everything it doesn't override. Neither absence
nor an empty map says whether a fee is actually being charged: a rate is only live on an active hub (see
Readiness) and is otherwise **inactive**, not zero. A `0` entry in either map remains a real "free" rate
an owner chose, distinct from having no override at all.
