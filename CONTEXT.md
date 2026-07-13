# Context & glossary

Shared vocabulary for this MCP server. Everything here is described against the public surfaces the
client consumes — the deployed contracts (their ABIs and events), the game API (`GET /api/v1/config`,
the trade/map endpoints), and the MCP tools — never against any backend internals.

## Fees

All fee rates on the MCP surface are expressed in **percent**. The contracts and the game API express
them in **basis points** (1 bp = 0.01%, 100 bp = 1%); the client converts at that boundary
(`bpToPercent` / `percentToBp` in `src/utils/format.utils.ts`) and rejects a rate finer than one whole
basis point.

- **Sale fee** — a hub owner's per-resource share of every sale settled on their hub, carved out of the
  seller's proceeds (the buyer is unaffected — they still pay exactly `pricePerUnit × value`). Structural
  cap: 50%. Set your own with `cpu_set_sale_fee`; read others' live rates in `cpu_get_markets` (per row)
  and `cpu_get_cell` (per resource).
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

On a cell, `transitFeeOverrides` distinguishes **not a transit point** (`null`) from a **transit point
charging the default for everything** (`{}`). Likewise `saleFeeOverrides` is `null` when the API is not
serving sale fees for the cell (not a Ready hub); a value of `0` there is a real "listed free" rate, not a
cleared sentinel.
