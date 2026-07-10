import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import { registerGetBalanceTool } from './tools/account/get-balance/get-balance.js';
import { registerAuthenticateTool } from './tools/authenticate.js';
import { registerBuildTool } from './tools/build/build.js';
import { registerDemolishTool } from './tools/build/demolish.js';
import { registerGetGameConfigTool } from './tools/config/get-game-config/get-game-config.js';
import { registerClaimCraftTool } from './tools/craft/claim/claim-craft.js';
import { registerCraftTool } from './tools/craft/craft.js';
import { registerGetCraftStatusTool } from './tools/craft/get-status/get-craft-status.js';
import { registerListRecipesTool } from './tools/craft/list-recipes/list-recipes.js';
import { registerGetAttentionTool } from './tools/map/attention/attention.js';
import { registerGetCellTool } from './tools/map/get-cell/get-cell.js';
import { registerGetChangesTool } from './tools/map/get-changes/get-changes.js';
import { registerGetMapTool } from './tools/map/get-map/get-map.js';
import { registerClaimMiningTool } from './tools/mining/claim/claim-mining.js';
import { registerGetMiningStatusTool } from './tools/mining/get-status/get-mining-status.js';
import { registerStartMiningTool } from './tools/mining/start/start-mining.js';
import { registerMintCellTool } from './tools/mint/mint-cell.js';
import { registerQuoteMintTool } from './tools/mint/quote/quote-mint.js';
import { registerRevealTool } from './tools/reveal/reveal.js';
import { registerQuoteSwapTool } from './tools/swap/quote/quote-swap.js';
import { registerSwapTool } from './tools/swap/swap.js';
import { registerBuyLotTool } from './tools/trade/buy-lot/buy-lot.js';
import { registerCancelLotTool } from './tools/trade/cancel-lot/cancel-lot.js';
import { registerCreateLotTool } from './tools/trade/create-lot/create-lot.js';
import { registerGetLotTool } from './tools/trade/get-lot/get-lot.js';
import { registerListLotsTool } from './tools/trade/list-lots/list-lots.js';
import { registerListMyLotsTool } from './tools/trade/list-mine/list-my-lots.js';
import { registerGetMarketsTool } from './tools/trade/markets/get-markets.js';
import { registerQuoteBuyTool } from './tools/trade/quote-buy/quote-buy.js';
import { registerFinalizeDeliveryTool } from './tools/transport/finalize/finalize-delivery.js';
import { registerGetTransportStatusTool } from './tools/transport/get-status/get-transport-status.js';
import { registerListMyTransportsTool } from './tools/transport/list-mine/list-my-transports.js';
import { registerPlanRouteTool } from './tools/transport/plan/plan-route.js';
import { registerQuoteTransportTool } from './tools/transport/quote/quote-transport.js';
import { registerTransportTool } from './tools/transport/transport.js';
import { registerWithdrawTool } from './tools/withdraw/withdraw.js';
import type { AppContext } from './types.js';

const SERVER_INSTRUCTIONS = [
    'MCP server for Project CPU (blockchain game on EVM).',
    'Call `cpu_authenticate` to create a session: in the default EVM mode it signs in via SIWE locally;',
    'in AGW mode it starts a Device Authorization flow.',
    'Read the static rulebook once with `cpu_get_game_config` — resource catalog, the building catalog (each',
    "building's kind, cost, and what it mines or crafts), reveal cost, recipes, and contract addresses.",
    'The world is a finite sphere of 48,990 land cells identified only by tokenId (1..48990) — there are no',
    'coordinates; adjacency comes from each cell’s `neighbors` list and routes are planned with `cpu_plan_route`.',
    'The world map is loaded at startup and kept current in the background; read it with `cpu_get_map`',
    '(situational awareness), `cpu_get_cell` (inspect one cell), `cpu_get_changes` (react to other players since a',
    'given version), and `cpu_get_attention` (your owner-scoped to-do list of stalled/near-full/depleted/unbuilt',
    'cells + deliveries ready to finalize). You only observe updates when you call these — there is no push.',
    'Act on a cell you own with `cpu_reveal`, which surfaces its resource deposits on-chain.',
    'Place a building with `cpu_build` (paid in $CPU, auto-settled on-chain) — an extractor mines a raw deposit, a',
    'crafter runs a recipe, the Hub routes transport/trade. Building takes time and is not usable until it',
    'finishes. Once an extractor is ready, start it with `cpu_start_mining` (pick the target resource, or omit it',
    'for a single-resource extractor); it then mines a batch of the raw resource each cycle — read matured',
    'batches with `cpu_get_mining_status` and bank them with `cpu_claim_mining`.',
    'Every resource has a per-cell warehouse with a storage cap; when it fills, that resource’s production',
    '(mining or craft) stalls until you offload it (transport, sell, craft, or withdraw). A null cap means',
    'uncapped. `cpu_get_mining_status`/`cpu_get_craft_status` report the stall; `cpu_get_attention` lists every stalled or',
    'near-full cell at once.',
    'Move resources between cells with `cpu_transport` (plan the waypoint chain with `cpu_plan_route`, then preview',
    'cost with `cpu_quote_transport`) — one on-chain',
    'move that debits the source, pays the $CPU transit fee for any foreign Hub on the route, and escrows a',
    'time-delayed delivery. Track deliveries with `cpu_get_transport_status` / `cpu_list_my_transports`; a delivery is',
    'credited to the target only after it arrives and you call `cpu_finalize_delivery`.',
    'Refine and forge resources with `cpu_craft` — discover recipes via `cpu_list_recipes` (each shows its',
    '`costCpu`; a recipe with a non-zero cost auto-approves and settles the $CPU on-chain, the rest are free);',
    'read progress with `cpu_get_craft_status` and bank matured batches with `cpu_claim_craft`.',
    'Cash out a cell’s wCPU to the on-chain $CPU token (1:1) with `cpu_withdraw` — one in flight at a time; re-run',
    'with the same args to finish an interrupted one, and withdraw before selling a cell since wCPU travels',
    'with it.',
    'Acquire land cells on the primary market with `cpu_mint_cell` — it mints new cells straight from the',
    'collection’s OpenSea SeaDrop public drop, paid in native ETH (preview the ETH cost first with `cpu_quote_mint`).',
    'For the secondary market — buying or selling existing cells — use OpenSea listings off-server: open the',
    'collection by its `land` contract address from `cpu_get_game_config`',
    '(https://opensea.io/assets/<chain>/<land>; testnet chains live on testnets.opensea.io). For $CPU itself',
    'there is no external venue — buy and sell it in-game with `cpu_swap` (below).',
    'Trade at Hubs: survey the marketplace with `cpu_get_markets` then `cpu_list_lots`, inspect one with `cpu_get_lot`,',
    'and act with `cpu_create_lot` (list goods), `cpu_buy_lot` (preview cost first with `cpu_quote_buy`), and `cpu_cancel_lot`.',
    'Each settles on-chain in a single tx and routes its goods through Transport, so they land only after you',
    '`cpu_finalize_delivery` on the returned deliveryId once it arrives; track your lots with `cpu_list_my_lots`.',
    'Check spendable $CPU and gas with `cpu_get_balance` before any paid action.',
    'A `cpu_withdraw` mints $CPU against an off-chain signature; if it is interrupted, re-run it with the same args',
    'to finish the pending one rather than starting a second.',
    'Swap between native ETH and $CPU on the token pool with `cpu_swap` (preview first with `cpu_quote_swap`);',
    '`sell: "ETH"` buys $CPU and `sell: "CPU"` sells it — the trade auto-settles on-chain.',
].join(' ');

export async function createServer(context: AppContext): Promise<void> {
    const server = new McpServer({ name: pkg.name, version: pkg.version }, { instructions: SERVER_INSTRUCTIONS });

    registerAuthenticateTool(server, context);
    registerGetGameConfigTool(server, context);
    registerGetMapTool(server, context);
    registerGetCellTool(server, context);
    registerGetChangesTool(server, context);
    registerGetAttentionTool(server, context);
    registerRevealTool(server, context);
    registerBuildTool(server, context);
    registerDemolishTool(server, context);
    registerListRecipesTool(server, context);
    registerCraftTool(server, context);
    registerGetCraftStatusTool(server, context);
    registerClaimCraftTool(server, context);
    registerStartMiningTool(server, context);
    registerGetMiningStatusTool(server, context);
    registerClaimMiningTool(server, context);
    registerPlanRouteTool(server, context);
    registerQuoteTransportTool(server, context);
    registerTransportTool(server, context);
    registerListMyTransportsTool(server, context);
    registerGetTransportStatusTool(server, context);
    registerFinalizeDeliveryTool(server, context);
    registerGetMarketsTool(server, context);
    registerListLotsTool(server, context);
    registerGetLotTool(server, context);
    registerListMyLotsTool(server, context);
    registerQuoteBuyTool(server, context);
    registerCreateLotTool(server, context);
    registerBuyLotTool(server, context);
    registerCancelLotTool(server, context);
    registerQuoteSwapTool(server, context);
    registerSwapTool(server, context);
    registerQuoteMintTool(server, context);
    registerMintCellTool(server, context);
    registerGetBalanceTool(server, context);
    registerWithdrawTool(server, context);

    const stdio = new StdioServerTransport();
    await server.connect(stdio);
}
