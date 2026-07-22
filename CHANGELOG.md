# Changelog

## [0.8.0](https://github.com/sodiqit/project-cpu-mcp/compare/v0.7.0...v0.8.0) (2026-07-22)


### ⚠ BREAKING CHANGES

* integrate syndicates — clan-aware trade/transport quotes, results, and registry tools ([#35](https://github.com/sodiqit/project-cpu-mcp/issues/35))
* per-resource transit-fee floors replace the scalar default ([#34](https://github.com/sodiqit/project-cpu-mcp/issues/34))
* adapt trade, mining, withdraw, craft and demolish to the season redeploy ([#33](https://github.com/sodiqit/project-cpu-mcp/issues/33))
* cpu_start_mining and cpu_craft results gain a required `modeSwitch` block, cpu_start_mining gains `approveTxHash`, and the building catalog gains `modeSwitch`. cpu_start_mining no longer claims it costs no $CPU.

### Features

* adapt trade, mining, withdraw, craft and demolish to the season redeploy ([#33](https://github.com/sodiqit/project-cpu-mcp/issues/33)) ([838b45a](https://github.com/sodiqit/project-cpu-mcp/commit/838b45a5a1427e45900178e5b7f69a134f3ae70e))
* integrate syndicates — clan-aware trade/transport quotes, results, and registry tools ([#35](https://github.com/sodiqit/project-cpu-mcp/issues/35)) ([4d2b7c5](https://github.com/sodiqit/project-cpu-mcp/commit/4d2b7c57e4bd3ac4291196bc18f4686d37d94493))
* per-resource transit-fee floors replace the scalar default ([#34](https://github.com/sodiqit/project-cpu-mcp/issues/34)) ([67a02a4](https://github.com/sodiqit/project-cpu-mcp/commit/67a02a4d1de487419e07a118684d5c660dab6906))
* price building mode switches and report the burn ([#30](https://github.com/sodiqit/project-cpu-mcp/issues/30)) ([59d091f](https://github.com/sodiqit/project-cpu-mcp/commit/59d091f80307188a330b8b4b38d955af4f8c1bdf))

## [0.7.0](https://github.com/sodiqit/project-cpu-mcp/compare/v0.6.1...v0.7.0) (2026-07-15)


### ⚠ BREAKING CHANGES

* **mining:** startMining takes a required `batches` (1..1000); the map wire renames `batch` to `yieldPerCycle` and adds `batches`/`claimedBatches`; statuses share `completedBatches`/`claimableBatches`/`isFinished`; `storage.stalled` is now `storage.full`. `CraftClaimed` and `ResourceMined` carry the accrual cursor and an absolute `claimedBatches`. Requires the bounded-mining contract and API.
* **trade:** cpu_route_network and cpu_next_hops now require a resourceId input; the always-zero tradeFeePct output field is removed from lot and market reads; the cell-state transit fee field changed from a scalar transitFeePerUnit to per-resource transitFeeOverrides / saleFeeOverrides records.

### Features

* **map:** derive readiness, storage caps, and hub eligibility in the reader ([#28](https://github.com/sodiqit/project-cpu-mcp/issues/28)) ([df950f0](https://github.com/sodiqit/project-cpu-mcp/commit/df950f0ea3a49c8f767e74024bfa52311f098962))
* **mining:** bounded extraction jobs with an explicit cycle count ([f955152](https://github.com/sodiqit/project-cpu-mcp/commit/f95515270670c4a4f0f35664dda768b19bb024f1))
* **trade:** hub sale fee + per-resource transit fees ([0da964d](https://github.com/sodiqit/project-cpu-mcp/commit/0da964d313a5b338e90dc2fd4445eb1a86bfbde7))

## [0.6.1](https://github.com/sodiqit/project-cpu-mcp/compare/v0.6.0...v0.6.1) (2026-07-10)


### Bug Fixes

* align Cell ABI with the deployed contract ([#24](https://github.com/sodiqit/project-cpu-mcp/issues/24)) ([cfe8fc5](https://github.com/sodiqit/project-cpu-mcp/commit/cfe8fc5f7b23309e89a330b9923a5dd2380ecd2c))

## [0.6.0](https://github.com/sodiqit/project-cpu-mcp/compare/v0.5.0...v0.6.0) (2026-07-10)


### ⚠ BREAKING CHANGES

* 
* removed battery_plant / make_battery from the cpu_build and cpu_craft input enums (dropped from the backend roster).
* align mining to the backend matured-batch model ([#19](https://github.com/sodiqit/project-cpu-mcp/issues/19))
* align economy to GDD roster; split mining into cpu_start_mining ([#18](https://github.com/sodiqit/project-cpu-mcp/issues/18))
* every MCP tool is renamed to cpu_<name> (e.g. get_map -> cpu_get_map).
* tool JSON output field names and units changed — every *Wei amount field is now a decimal (no wei), and the swap/mint/balance *Wei twins are removed.
* withdraw `amount` is now a whole-unit integer (uint64), no decimals; the result drops `signId`/`resumed`/`approveTxHash` and `amount` is whole wCPU units rather than wei; the `gameSettlement` contract address is removed from the config surface.
* trade write/quote outputs reshaped (per-action results with deliveryId, no free/paid union), cancel_lot chain now required, LotState reduced to delivering|open|sold|cancelled. Requires the game API to expose the `trade` address in GET /api/v1/config.
* build, mining, and craft tool output shapes changed; the free/paid craft split collapses to a single on-chain start; a new demolish tool is added.
* removes the get_pending_transports and resume_transport tools; adds finalize_delivery (a delivery is credited only after arrival and an explicit finalize). transport / quote_transport / get_transport_status / list_my_transports change their input and output shapes, and get_transport_status now takes a string deliveryId.
* the reveal tool output shape changed (adds x, y, genesis, feeWei, reRevealCostWei, fulfilled; drops signId, cpuAmount) and it now requires contracts.cell in GET /api/v1/config. The POST /api/v1/reveal signature dependency is removed.

### Features

* add mint_cell and quote_mint tools for SeaDrop land minting ([#9](https://github.com/sodiqit/project-cpu-mcp/issues/9)) ([5bc2cc0](https://github.com/sodiqit/project-cpu-mcp/commit/5bc2cc0659c6fb0fe4522959ae2a501a05cc8778))
* align demolish to backend cost + cooldown ([#20](https://github.com/sodiqit/project-cpu-mcp/issues/20)) ([68edbea](https://github.com/sodiqit/project-cpu-mcp/commit/68edbea5699c27c045ccd5f1a617397e3a22c2dd))
* align economy to GDD roster; split mining into cpu_start_mining ([#18](https://github.com/sodiqit/project-cpu-mcp/issues/18)) ([4e219ce](https://github.com/sodiqit/project-cpu-mcp/commit/4e219cefc65d37136625715e8a3b92ce18692fb9))
* align mining to the backend matured-batch model ([#19](https://github.com/sodiqit/project-cpu-mcp/issues/19)) ([fa07087](https://github.com/sodiqit/project-cpu-mcp/commit/fa070873bc5532e729057eb76ec3451eee94cec6))
* migrate to the spherical tokenId world grid ([#21](https://github.com/sodiqit/project-cpu-mcp/issues/21)) ([618f3d3](https://github.com/sodiqit/project-cpu-mcp/commit/618f3d39888f641ca28e6030eea369913bd7934d))
* move building, mining, and craft on-chain via Cell contract ([#13](https://github.com/sodiqit/project-cpu-mcp/issues/13)) ([3e96814](https://github.com/sodiqit/project-cpu-mcp/commit/3e9681454a9223d8a98c401dad1fd4413fed9322))
* move reveal fully on-chain via Pyth Entropy ([#11](https://github.com/sodiqit/project-cpu-mcp/issues/11)) ([319c9e4](https://github.com/sodiqit/project-cpu-mcp/commit/319c9e4edf3c065c596c2e78871c7df85e9f9d9a))
* move trade (lots) fully on-chain via Trade contract ([#14](https://github.com/sodiqit/project-cpu-mcp/issues/14)) ([63b41d9](https://github.com/sodiqit/project-cpu-mcp/commit/63b41d97516195596c67af8e06eed319f0b97422))
* move transport fully on-chain via Transport contract ([#12](https://github.com/sodiqit/project-cpu-mcp/issues/12)) ([f11c062](https://github.com/sodiqit/project-cpu-mcp/commit/f11c062a32c60653a5e076175f82ee4488ef4ccb))
* move withdraw fully on-chain via Cell contract ([#15](https://github.com/sodiqit/project-cpu-mcp/issues/15)) ([a209e7a](https://github.com/sodiqit/project-cpu-mcp/commit/a209e7a61e7f9f01890fc939ede2166a1f9a3e3a))
* return human-readable $CPU/ETH amounts in all tool output ([#16](https://github.com/sodiqit/project-cpu-mcp/issues/16)) ([962ff47](https://github.com/sodiqit/project-cpu-mcp/commit/962ff47cb1458277b5a2076d252425a0d6fbacfd))
* storage caps + get_attention tool, prefix all tools cpu_ ([7d69615](https://github.com/sodiqit/project-cpu-mcp/commit/7d696151028b889e7278e1be9e080703d0952086))


### Bug Fixes

* decode custom-error reverts on writes; correct transport/mining tool texts ([#22](https://github.com/sodiqit/project-cpu-mcp/issues/22)) ([26745b0](https://github.com/sodiqit/project-cpu-mcp/commit/26745b0f386afa6998c844ec20ae02a3b9c314e8))
* emit get_attention DepositDepleted for finished extractors ([4dea2bf](https://github.com/sodiqit/project-cpu-mcp/commit/4dea2bff90129362d0520432f7d3e3d85a0e41d2))

## [0.5.0](https://github.com/sodiqit/project-cpu-mcp/compare/v0.4.2...v0.5.0) (2026-06-24)


### ⚠ BREAKING CHANGES

* the npm package is published under a new name (project-cpu-mcp); the old `npx cpu-game-mcp` will no longer receive updates. The MCP server key and the session directory also change, so existing client configs and saved sessions must be re-created (re-run `authenticate`).

### Features

* rebrand CPU Game to Project CPU ([#7](https://github.com/sodiqit/project-cpu-mcp/issues/7)) ([0793251](https://github.com/sodiqit/project-cpu-mcp/commit/07932515b5e41aec925b42633a0b4f72cd9e70ae))

## [0.4.2](https://github.com/sodiqit/project-cpu-mcp/compare/v0.4.1...v0.4.2) (2026-06-24)


### Bug Fixes

* document where to buy land (OpenSea) and $CPU (swap) for agents ([#5](https://github.com/sodiqit/project-cpu-mcp/issues/5)) ([b5b34e2](https://github.com/sodiqit/project-cpu-mcp/commit/b5b34e246774a8bf4663953d4a3318a4a3580e31))

## [0.4.1](https://github.com/sodiqit/cpu-game-mcp/compare/v0.4.0...v0.4.1) (2026-06-24)


### Bug Fixes

* correct MCP tool descriptions and error guidance to match server behavior ([6e5c0bf](https://github.com/sodiqit/cpu-game-mcp/commit/6e5c0bf692e8a0c66d59877b053d2d0187f349df))
