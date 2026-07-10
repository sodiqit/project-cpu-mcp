# project-cpu-mcp

MCP (Model Context Protocol) server for **Project CPU** — a blockchain game on EVM. It lets an
AI agent play on your behalf: read the world map, reveal cells, build and mine, craft, move
resources, trade at marketplaces, and cash out to on-chain $CPU. Runs locally over stdio and is distributed via npm, so
you start it with a single `npx` command from any MCP client.

## Installation

Pick your client below and add the server. The only required setting is your wallet's `PRIVATE_KEY` (`0x` + 64 hex chars) — replace `0x…` with yours.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add project-cpu -s user -e PRIVATE_KEY=0x… -- npx -y project-cpu-mcp@latest
```

- `-s user` installs it across all your projects; omit it (or use `-s local`) for the current project only.
- `-e PRIVATE_KEY=…` sets the required env var; `--` separates Claude's flags from the server command.

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart the app:

```json
{
  "mcpServers": {
    "project-cpu": {
      "command": "npx",
      "args": ["-y", "project-cpu-mcp@latest"],
      "env": { "PRIVATE_KEY": "0x…" }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (this project):

```json
{
  "mcpServers": {
    "project-cpu": {
      "command": "npx",
      "args": ["-y", "project-cpu-mcp@latest"],
      "env": { "PRIVATE_KEY": "0x…" }
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot agent mode)</strong></summary>

Create `.vscode/mcp.json` — VS Code prompts for the key at startup instead of storing it:

```json
{
  "inputs": [
    { "type": "promptString", "id": "privateKey", "description": "Project CPU private key", "password": true }
  ],
  "servers": {
    "project-cpu": {
      "command": "npx",
      "args": ["-y", "project-cpu-mcp@latest"],
      "env": { "PRIVATE_KEY": "${input:privateKey}" }
    }
  }
}
```

(In user `settings.json`, wrap the whole object in an `"mcp": { … }` key.)

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`, then restart Windsurf:

```json
{
  "mcpServers": {
    "project-cpu": {
      "command": "npx",
      "args": ["-y", "project-cpu-mcp@latest"],
      "env": { "PRIVATE_KEY": "0x…" }
    }
  }
}
```

</details>

## Environment variables

**Required**

| Variable | Description |
| --- | --- |
| `PRIVATE_KEY` | Your wallet private key — `0x` followed by 64 hex chars (32 bytes). |

**Optional** — has a sensible default; normal users can omit it.

| Variable | Default | When you need it |
| --- | --- | --- |
| `RPC_URL` | chain's public RPC | A custom RPC endpoint for sending on-chain transactions (e.g. `cpu_reveal`). |

Session state (JWT / session keys) is persisted to `~/.project-cpu/`.

## What the agent can do

Once connected, the server exposes tools grouped by area:

- **Session** — `cpu_authenticate`, `cpu_get_game_config` (static rulebook: resources, costs, contract
  addresses), `cpu_get_balance` (spendable $CPU + gas).
- **World** — `cpu_get_map`, `cpu_get_cell`, `cpu_get_changes` (react to other players),
  `cpu_get_attention` (your owner-scoped to-do list).
- **Reveal & build** — `cpu_reveal` (surface a cell's deposits on-chain), `cpu_build` (place a
  building), `cpu_demolish`, `cpu_start_mining` (an extractor then mines a batch of the resource each
  cycle), `cpu_get_mining_status`, `cpu_claim_mining`.
- **Transport** — `cpu_route_network` (the waypoint road map: nodes, legal hops, gaps),
  `cpu_next_hops` (survey the legal waypoints around a cell),
  `cpu_quote_transport`, `cpu_transport`, `cpu_get_transport_status`, `cpu_list_my_transports`,
  `cpu_finalize_delivery`.
- **Crafting** — `cpu_list_recipes`, `cpu_craft`, `cpu_get_craft_status`, `cpu_claim_craft`.
- **Trading** — `cpu_get_markets`, `cpu_list_lots`, `cpu_get_lot`, `cpu_quote_buy`, `cpu_buy_lot`, `cpu_create_lot`,
  `cpu_cancel_lot`, `cpu_list_my_lots`.
- **Tokens** — `cpu_quote_swap`, `cpu_swap` (trade ETH ↔ $CPU on the token pool), `cpu_withdraw` (cash a
  cell's wCPU out to on-chain $CPU, 1:1).

Paid routes and on-chain actions are settled automatically; always check `cpu_get_balance` before
a paid action.

## Requirements

- Node.js ≥ 20

## License

[MIT](./LICENSE)
