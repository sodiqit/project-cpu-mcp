# cpu-game-mcp

MCP (Model Context Protocol) server for **CPU Game** — a blockchain game on EVM. It lets an
AI agent play on your behalf: read the world map, reveal cells, build and mine, craft, move
resources, and trade at marketplaces. Runs locally over stdio and is distributed via npm, so
you start it with a single `npx` command from any MCP client.

## Installation

Pick your client below and add the server. The only required setting is your wallet's `PRIVATE_KEY` (`0x` + 64 hex chars) — replace `0x…` with yours.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add cpu-game -s user -e PRIVATE_KEY=0x… -- npx -y cpu-game-mcp@latest
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
    "cpu-game": {
      "command": "npx",
      "args": ["-y", "cpu-game-mcp@latest"],
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
    "cpu-game": {
      "command": "npx",
      "args": ["-y", "cpu-game-mcp@latest"],
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
    { "type": "promptString", "id": "privateKey", "description": "CPU Game private key", "password": true }
  ],
  "servers": {
    "cpu-game": {
      "command": "npx",
      "args": ["-y", "cpu-game-mcp@latest"],
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
    "cpu-game": {
      "command": "npx",
      "args": ["-y", "cpu-game-mcp@latest"],
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

Session state (JWT / session keys) is persisted to `~/.cpu-game/`.

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

Paid routes and on-chain actions are settled automatically; always check `get_balance` before
a paid action.

## Requirements

- Node.js ≥ 20

## License

[MIT](./LICENSE)
