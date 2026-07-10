# Changelog

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
