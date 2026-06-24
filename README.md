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
| `RPC_URL` | chain's public RPC | A custom RPC endpoint for sending on-chain transactions (e.g. `reveal`). |

Session state (JWT / session keys) is persisted to `~/.project-cpu/`.

## What the agent can do

Once connected, the server exposes tools grouped by area:

- **Session** — `authenticate`, `get_game_config` (static rulebook: resources, costs, contract
  addresses), `get_balance` (spendable $CPU + gas).
- **World** — `get_map`, `get_cell`, `get_changes` (react to other players).
- **Reveal & build** — `reveal` (surface a cell's deposits on-chain), `build` (place a
  building; an extractor starts mining automatically), `get_mining_status`, `claim_mining`.
- **Transport** — `quote_transport`, `transport`, `get_transport_status`,
  `list_my_transports`, `get_pending_transports`, `resume_transport`.
- **Crafting** — `list_recipes`, `craft`, `get_craft_status`, `claim_craft`.
- **Trading** — `get_markets`, `list_lots`, `get_lot`, `quote_buy`, `buy_lot`, `create_lot`,
  `cancel_lot`, `list_my_lots`.
- **Tokens** — `quote_swap`, `swap` (trade ETH ↔ $CPU on the token pool), `withdraw` (cash a
  cell's wCPU out to on-chain $CPU, 1:1).

Paid routes and on-chain actions are settled automatically; always check `get_balance` before
a paid action.

## Requirements

- Node.js ≥ 20

## License

[MIT](./LICENSE)
