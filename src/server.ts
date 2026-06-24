import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import pkg from '../package.json' with { type: 'json' };
import { registerGetBalanceTool } from './tools/account/get-balance/get-balance.js';
import { registerAuthenticateTool } from './tools/authenticate.js';
import { registerBuildTool } from './tools/build/build.js';
import { registerGetGameConfigTool } from './tools/config/get-game-config/get-game-config.js';
import { registerClaimCraftTool } from './tools/craft/claim/claim-craft.js';
import { registerCraftTool } from './tools/craft/craft.js';
import { registerGetCraftStatusTool } from './tools/craft/get-status/get-craft-status.js';
import { registerListRecipesTool } from './tools/craft/list-recipes/list-recipes.js';
import { registerGetCellTool } from './tools/map/get-cell/get-cell.js';
import { registerGetChangesTool } from './tools/map/get-changes/get-changes.js';
import { registerGetMapTool } from './tools/map/get-map/get-map.js';
import { registerClaimMiningTool } from './tools/mining/claim/claim-mining.js';
import { registerGetMiningStatusTool } from './tools/mining/get-status/get-mining-status.js';
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
import { registerGetPendingTransportsTool } from './tools/transport/get-pending/get-pending-transports.js';
import { registerGetTransportStatusTool } from './tools/transport/get-status/get-transport-status.js';
import { registerListMyTransportsTool } from './tools/transport/list-mine/list-my-transports.js';
import { registerQuoteTransportTool } from './tools/transport/quote/quote-transport.js';
import { registerResumeTransportTool } from './tools/transport/resume/resume-transport.js';
import { registerTransportTool } from './tools/transport/transport.js';
import { registerWithdrawTool } from './tools/withdraw/withdraw.js';
import type { AppContext } from './types.js';

const SERVER_INSTRUCTIONS = [
    'MCP server for the CPU Game (blockchain game on EVM).',
    'Call `authenticate` to create a session: in the default EVM mode it signs in via SIWE locally;',
    'in AGW mode it starts a Device Authorization flow.',
    'Read the static rulebook once with `get_game_config` — resource catalog, building and reveal costs,',
    'recipe count, and contract addresses.',
    'The world map is loaded at startup and kept current in the background; read it with `get_map`',
    '(situational awareness), `get_cell` (inspect one cell), and `get_changes` (react to other players',
    'since a given version). You only observe updates when you call these — there is no push.',
    'Act on a cell you own with `reveal`, which surfaces its resource deposits on-chain.',
    'Place a building with `build` — an `extractor` (paid in $CPU, auto-settled on-chain) starts mining its',
    'target resource automatically; read accrual with `get_mining_status` and bank it with `claim_mining`.',
    'Move resources between cells with `transport` (preview cost first with `quote_transport`); a route',
    'through a foreign Hub is paid in $CPU and auto-settled on-chain. Track shipments with',
    '`get_transport_status` / `list_my_transports`; finish an interrupted payment with',
    '`get_pending_transports` + `resume_transport`.',
    'Refine and forge resources with `craft` — discover recipes via `list_recipes` (the `forge_wcpu` recipe',
    'is paid in $CPU and auto-settled on-chain, the rest are free); read progress with `get_craft_status` and',
    'bank matured batches with `claim_craft`.',
    'Cash out a cell’s wCPU to the on-chain $CPU token (1:1) with `withdraw` — one in flight at a time; re-run',
    'with the same args to finish an interrupted one, and withdraw before selling a cell since wCPU travels',
    'with it.',
    'Buy and sell land cells off-server on OpenSea — there is no in-server tool for this: on the primary market',
    'mint new cells from the collection’s SeaDrop public drop, and on the secondary market buy or sell existing',
    'cells via listings. Open the collection by its `land` contract address from `get_game_config`',
    '(https://opensea.io/assets/<chain>/<land>; testnet chains live on testnets.opensea.io). For $CPU itself',
    'there is no external venue — buy and sell it in-game with `swap` (below).',
    'Trade at Hubs: survey the marketplace with `get_markets` then `list_lots`, inspect one with `get_lot`,',
    'and act with `create_lot` (list goods), `buy_lot` (preview cost first with `quote_buy`), and `cancel_lot`',
    '— paid routes auto-settle on-chain; track your lots with `list_my_lots`.',
    'Check spendable $CPU and gas with `get_balance` before any paid action.',
    'Paid actions (transport, trade, craft forge, withdraw) escrow at signing; if a payment is interrupted and',
    'its signature lapses, the escrow is refunded automatically within about a minute — do not try to free it',
    'manually, and note that starting the same action again while one is still pending is rejected.',
    'Swap between native ETH and $CPU on the token pool with `swap` (preview first with `quote_swap`);',
    '`sell: "ETH"` buys $CPU and `sell: "CPU"` sells it — the trade auto-settles on-chain.',
].join(' ');

export async function createServer(context: AppContext): Promise<void> {
    const server = new McpServer({ name: pkg.name, version: pkg.version }, { instructions: SERVER_INSTRUCTIONS });

    registerAuthenticateTool(server, context);
    registerGetGameConfigTool(server, context);
    registerGetMapTool(server, context);
    registerGetCellTool(server, context);
    registerGetChangesTool(server, context);
    registerRevealTool(server, context);
    registerBuildTool(server, context);
    registerListRecipesTool(server, context);
    registerCraftTool(server, context);
    registerGetCraftStatusTool(server, context);
    registerClaimCraftTool(server, context);
    registerGetMiningStatusTool(server, context);
    registerClaimMiningTool(server, context);
    registerQuoteTransportTool(server, context);
    registerTransportTool(server, context);
    registerListMyTransportsTool(server, context);
    registerGetTransportStatusTool(server, context);
    registerGetPendingTransportsTool(server, context);
    registerResumeTransportTool(server, context);
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
    registerGetBalanceTool(server, context);
    registerWithdrawTool(server, context);

    const stdio = new StdioServerTransport();
    await server.connect(stdio);
}
