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
- **Cycle** — one production tick of a Process (`durationSec`). Mining draws the Take from the deposit and
  credits the Warehouse credit to the warehouse; a craft runs one recipe batch.
- **Batches** — the number of Cycles a Process was scheduled for, chosen at start (both kinds) and capped
  at 1000. `claimedBatches` counts those already banked, absolute rather than a delta.
- **Warehouse credit** — a process's per-cycle yield: the output units one mining Cycle credits to the
  warehouse — the credited output, not the draw (see Take). Surfaced as a mining Process's `yieldPerCycle`.
  *Avoid*: batch (in this meaning).
- **Take** — the full per-cycle deposit draw of an extractor: everything one mining Cycle removes from the
  deposit, before the Extraction share splits it. Equal to Warehouse credit on a base extractor; larger on
  an upgraded one, whose Extraction share credits only part of what it takes — so those deposits drain
  faster than Warehouse credit alone suggests. Not itself surfaced on the map; reconstructed from
  Warehouse credit and Extraction share.
- **Extraction share** — the basis-point fraction of the Take credited to the warehouse as Warehouse
  credit; the rest returns to the reservoir rather than being lost. A building property
  (`effects.extractionShareBp` in `cpu_get_game_config`), lower on an upgraded extractor than on a base one.
- **Stall** — a Process whose matured Cycles cannot settle because the room holds less than one whole
  Cycle's output. Claims settle in whole Cycles, so a partial cycle's worth of room banks nothing. Stalled
  time is discarded — the cursor resets to the moment of the settle and the remaining Batches start
  producing from zero — but the schedule itself is never lost. Only time is.
  *Avoid*: pause, idle.
- **Cursor** — a Process's `startAt`: the point its next Cycle is measured from, not the moment it was
  started. Every claim moves it forward past the Cycles it banked, and a Stalled one resets it to now.

## Mode

What a building is pointed at, and what re-pointing it costs. A building remembers this across its
Process and across an Upgrade; only a demolish clears it.

- **Mode** — the output a building is pointed at: the resource an extractor is set to mine, or the recipe
  a crafter is set to run. Free on the first pick after building; changed thereafter by paying the
  building's Switch cost. Surfaced raw on a cell as `modeResource` / `modeRecipeId`, both `null` when
  nothing has been picked yet.
  *Avoid*: specialization.
- **Switch cost** — the $CPU burned to point a building at a different output than its current Mode; 25% of
  that building's own build cost, floored, so an upgraded building costs more to re-tool. Restarting the
  same output stays free, and a drained deposit does not make switching away from it free. Absent — **not
  zero** — for a building with one possible output or none: it can never switch. There is no cooldown; the
  fee is the only thing between you and a different output.
  *Avoid*: transit fee, sale fee, move fee.
- **Outputs** — `cpu_get_cell`'s per-cell enumeration of everything the building can be pointed at, each
  with what pointing it there costs right now: `free` (with `first_pick` or `same_output` as the reason),
  `paid` (with the price), or `unknown`. Outputs the building cannot produce at all are left out entirely.
  These prices are map-derived and **advisory** — the start tools re-price against the chain before they
  send. The list is not a startability check: a priced output may still lack a deposit or the inputs.

"Can never switch" is carried as its own fact, never as a price. A building catalog row reports
`modeSwitch` as `{"kind": "possible", "costCpu": "2"}`, `{"kind": "impossible"}` — with no price field at
all — or `{"kind": "unknown"}`, which means only that this client's loaded config predates the field. The
three are three different claims and never collapse: `unknown` is not `impossible`, and neither is `0`. A
price field never appears holding `null`, because `null` is exactly what a reader mistakes for free. This
is the same null≠empty≠zero discipline the fee overrides above already state.

A start (`cpu_start_mining`, `cpu_craft`) burns the Switch cost **inside the same transaction** as the
start itself, on the same approval, with no separate confirmation. Both tools therefore read the Mode
on-chain immediately before sending, disclose what they expect to burn, and — once the receipt lands —
report what **actually** burned in `modeSwitch.burnedCpu`. When the chain could not be read the price is
marked `exact: false` and the start still goes: a price this client cannot verify never blocks an action.
The reported burn is the authority whenever it disagrees with the estimate.

## Fees

All fee rates on the MCP surface are expressed in **percent**. The contracts and the game API express
them in **basis points** (1 bp = 0.01%, 100 bp = 1%); the client converts at that boundary
(`bpToPercent` / `percentToBp` in `src/utils/format.utils.ts`) and rejects a rate finer than one whole
basis point.

- **Sale fee** — a hub owner's per-resource share of every sale settled on their hub, carved out of the
  seller's proceeds (the buyer is unaffected — they still pay exactly `pricePerUnit × value`). Structural
  cap: 100%. Set your own with `cpu_set_sale_fee` — including while your hub is still under construction,
  so the rate is already in force the moment it becomes Ready. Read another hub's live rate in
  `cpu_get_markets` (per row); `cpu_get_cell` shows the hub's full rate intent per resource regardless of
  readiness (see Readiness).
- **Frozen lot** — an open lot whose hub's live rate has risen above the seller tolerance stored on it.
  Buys revert on-chain until the hub owner lowers the rate back to the tolerance or below; the escrow stays
  intact and untouched, and cancelling a frozen lot is always fee-free. Surfaced as `frozen` on a lot read
  and in `cpu_get_markets`' per-row frozen counts.
- **Seller tolerance** — the highest sale-fee rate a seller will accept at listing time
  (`cpu_create_lot`'s `maxSaleFeePercent`), stored per lot. When omitted, the client reads the hub's live
  rate on-chain and passes *that* as the tolerance, so a rate raised between the decision and the
  transaction landing reverts the listing (`SaleFeeExceedsMax`) instead of silently locking a worse rate in
  (see Frozen lot).
- **Sale burn** — the protocol's share of every sale, removed from supply. Config: `trade.saleBurnPercent`.
  The buy result reports the actual `burn` and `hubFee` amounts carved out of the sale.
- **Live rate** — a hub's current on-chain sale-fee rate for a resource: the rate every buy on that hub
  actually settles at, moment to moment — never a value fixed at listing time. Surfaced as `saleFeePercent`
  in lot reads and as `liveSaleFeePercent` in `cpu_get_markets` (enriched locally from the world map and
  advisory — it may trail the chain by moments; the on-chain rate at buy time is the authority).

## Transit fees

Charged by a foreign transit hub to route a shipment through it (distinct from the sale fee). Expressed in
**$CPU per unit** (decimal).

- **Transit fee override** — a hub's per-resource per-unit rate for one resource (`transitFeeOverrides` on
  a cell: `resourceId → decimal $CPU`).
- **Transit fee floor** — the config's per-resource minimum a foreign transit hub charges for a resource it
  has no override for (`transport.moveFeeFloors`: `resourceId → decimal $CPU`). Every resource in the game
  carries a floor — free transit no longer exists.
- **Effective transit fee** — what a shipment of a given resource actually pays through a hub: a non-zero
  override, else the resource's floor. An override set before its floor was later raised stays in force
  even below the new floor — the chain charges the override as set, and this client mirrors that rather
  than taking a maximum of the two. The route tools (`cpu_route_network`, `cpu_next_hops`) require a
  `resourceId` and report this exact effective rate per foreign-hub waypoint; the on-chain transport quote
  remains the authority for a routed total.

On a cell, `transitFeeOverrides` and `saleFeeOverrides` each report an *intent*, not a live rate: the
game API serves both maps for any hub-kind building, including one still under construction, so an
owner can set rates ahead of time and have them take effect the moment the hub becomes Ready. `null` in
either map means only **no hub-kind building at all** on the cell — nothing more. An *empty* map (`{}`)
means a hub — Ready or not — charging every resource's floor for transit, or no sale fee at all for sale
(sale has no floor to fall back to). Neither absence nor an empty map says whether a fee is actually being
charged: a rate is only live on an active hub (see Readiness) and is otherwise **inactive**, not zero.

The two maps disagree on what a `0` entry means. In `saleFeeOverrides`, `0` remains a real "free" rate an
owner chose, distinct from having no override at all — the sale model has no floor to fall back to. In
`transitFeeOverrides`, `0` is a reset sentinel: it clears the override and falls back to the resource's
floor rather than charging nothing, and such an entry never appears on the map wire — the game API strips
a reset override instead of serving a literal `0`.

## Withdraw

Converts a cell's wCPU balance to on-chain $CPU, 1:1.

- **Partial tranche** — a `cpu_withdraw` that executes for less than requested because the on-chain $CPU
  emission budget cannot cover the full amount: only `min(requested, budget remaining)` mints, the rest
  stays in the cell rather than the transaction reverting. The result reports the requested and executed
  amounts separately whenever they differ.
