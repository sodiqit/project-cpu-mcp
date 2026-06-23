# CPU Game MCP Server

MCP server for a blockchain game on EVM (Abstract). Distributed via npm, runs locally via `npx`.

Two wallet modes via `WALLET_MODE` (defaults to `evm`): `evm` (private key in env, SIWE auth — requires `PRIVATE_KEY`) or `agw` (Device Authorization flow). Session state persists to `~/.cpu-game/session.json`.

The target chain is chosen by `NETWORK` (optional, default `ethereum`; one of `ethereum | ethereum_sepolia | base | base_sepolia`) — its chainId is routed locally (`src/config/network.utils.ts`) and contract addresses are loaded from the game API `GET /api/v1/config?network=`. Set `RPC_URL` when sending transactions (e.g. `reveal`); it falls back to the chain's public RPC otherwise.

## Worktrees

**ALWAYS work in a worktree for ANY change — no exceptions.** The moment a task will touch a file
(code, config, workflow, docs, secrets — anything that gets committed), the FIRST action is to create
a worktree. The main checkout stays on `main` as a read-only hub; **never edit, branch, or commit in
it.** "It's a small/interactive/one-off change" is NOT an exception — every change goes through a
worktree. Read-only work (exploring, answering questions, running tests/builds) may stay in the hub.

Branches: `<type>/<kebab-slug>`, type — conventional-commit (`feat` `fix` `chore` `refactor` `test`
`docs` `perf` `ci` `build` `revert`); defaults to `feat` when no type is given.

- **YOU MUST** create worktrees only via `EnterWorktree` (or `claude --worktree <type>/<slug>`) — this
  runs `.claude/hooks/worktree-create.sh`, which branches off `main`, copies local-only files, and
  installs deps. A name without a type → branch `feat/<slug>`. Never `git worktree add` by hand and
  never `git checkout -b` in the hub — both bypass the hook, leaving the worktree without local files
  or deps (or polluting the hub).
- Worktrees live in the sibling `../mcp-worktrees/<branch-slug>` directory.
- A new local-only (gitignored) file a worktree needs → add its path to `ENV_FILES` in
  `.claude/hooks/worktree-create.sh`.

## Structure

```
src/
├── index.ts          # Entry — bootstraps AppContext, connects stdio
├── server.ts         # McpServer setup, tool registration
├── tools/            # MCP controllers (input → service → output)
├── services/         # Business logic, orchestration
├── wallet/           # WalletManager interface + EVM / AGW impls
├── api/              # ApiClient (HTTP to the game API, JWT bearer + SIWE re-login)
├── session/          # SessionStorage + SessionManager (persist JWT / session keys)
└── config/           # env + constants
```

## Code rules

### Separate types, constants, and helpers from implementation

Class, service, and factory files contain **only** their runtime logic. Everything else lives in its own sibling file:

- `types.ts` — interfaces, type aliases, enums, zod schemas
- `constants.ts` — constants and magic numbers (module-scoped)
- `*.utils.ts` / `*.helpers.ts` — pure helper / utility functions

Global / cross-module constants live in `src/config/constants.ts`.

Example layout:
```
session/
├── types.ts        # SessionStatus, SessionData, ISessionStorage, schemas
├── constants.ts    # SESSION_FILE_MODE, SESSION_DIR_MODE
├── manager.ts      # SessionManager class
├── storage.ts      # SessionStorage class
└── jwt.utils.ts    # decodeJwtPayload(), isJwtExpired() — pure helpers
```

Test helpers (mocks, fixtures) stay inline inside `__tests__/`.

### Nullable over optional

Declare `field: T | null` in interfaces and type aliases. The `no-restricted-syntax` ESLint rule rejects `field?: T`. For external data shapes (JWT payload, third-party responses), add an inline `// eslint-disable-next-line no-restricted-syntax` on the offending line.

For zod schemas, use `.nullable()` instead of `.optional()`. Normalize `undefined` inputs to `null` at the edge: `schema.parse({ FOO: env.FOO ?? null })`.

### Enums

Use TypeScript `enum` for named domain values, never string-literal unions. For zod: `z.nativeEnum(MyEnum)`.

### Dependency inversion

Constructors accept interfaces (`ISessionStorage`, `WalletManager`). Tests substitute in-memory implementations.

### Errors

Services throw. The MCP SDK catches at the tool boundary and returns `{ isError: true }` automatically. Add `try/catch` inside a tool only when you need to rewrite the error message.

### Comments

Comments explain **why**, not **how** or **what**. The code already says what it does; a comment that restates it is noise and rots. Reserve comments for the non-obvious: a rationale, a trade-off, a footgun, an invariant, a unit/edge-case the types can't express. If a comment just paraphrases the next line, delete it.

This is a **public repository**. Do not reference private/internal infrastructure (server internals, backend services, internal package names, hostnames) in code or comments — keep the source self-contained.

In particular, **never mention the backend or its source** anywhere in code, comments, ABIs, or docs — no file paths, module/enum names, package names (e.g. internal `@…/shared` packages), service names, or "copied/mirrors from `<backend file>`" notes. Describe things only in terms of the public API surface this client consumes (HTTP routes like `GET /api/v1/config`, on-chain contracts/ABIs, env vars). When copying an artifact such as a contract ABI, document only what it is and that it must match the deployed contract — never where it came from. The generic notion of "the game API" / "the server" the client talks to (and the `API_URL` env var) is fine; pointers into a separate backend repo are not.

### Logging

Use the `Logger` from `src/logger/` — do not call `process.stderr.write` directly and do not use `console.log` (banned by ESLint). stdio belongs to MCP JSON-RPC, so logs must stay on stderr.

```typescript
import { rootLogger } from './logger/index.js';

const logger = rootLogger.child('session');
logger.info('loaded session', { address });
logger.error('save failed', { error });
```

The logger redacts sensitive fields automatically (`privateKey`, `jwt`, `mnemonic`, raw `0x`-hex private keys, JWT tokens) in both messages and meta. If a new sensitive key is introduced, extend `SENSITIVE_KEYS` in `src/logger/constants.ts`.

## Conventions

- Files: `kebab-case` with suffixes like `.service.ts`, `.manager.ts`, `.utils.ts`
- Imports: keep the `.js` extension (NodeNext module resolution)
- Tooling configs (`.eslintrc`, `.prettierrc`): use the `.cjs` extension — the package is `"type": "module"`

## Testing

Use `.integration.test.ts` when a test touches real filesystem or network; plain `.test.ts` for pure logic.

Integration tests isolate state with `fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-game-mcp-test-'))` and clean up in `afterEach`. Never touch `os.homedir()`.

Reference: `src/session/__tests__/`.

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck         # type-check including test files (tsconfig.eslint.json)
pnpm test              # all tests
pnpm test:unit         # unit only (skips *.integration.test.ts)
pnpm lint              # zero warnings expected
pnpm lint:fix
pnpm format
```

Run `pnpm lint && pnpm build && pnpm typecheck && pnpm test` before every commit.

## Releasing

Bump the version **only** with `pnpm version <patch|minor|major>` — never hand-edit the `version` field in `package.json`. The command bumps `package.json`, creates the release commit (message = the bare version, e.g. `0.1.4`) and the matching `v<version>` git tag in one atomic step. It refuses to run on a dirty tree, so commit your code/doc changes first; the version commit is the last commit before the tag.

Pick the bump by what changed in the **public surface** (the MCP tools, their inputs/outputs, env vars, supported networks) — not by how big the diff is:

- `patch` (`0.1.3 → 0.1.4`) — backwards-compatible bug fix or internal change with no change to tool behaviour, inputs, or outputs. Example: fixing the map socket path.
- `minor` (`0.1.3 → 0.2.0`) — backwards-compatible new capability: a new tool, a new **optional** input, a new env var with a default, an additive output field.
- `major` (`0.1.3 → 1.0.0`) — breaking change to the public surface: removing/renaming a tool, making an input required or changing its type, changing an output shape consumers depend on, or dropping a network/env var.

Pre-1.0 caveat: while still on `0.x`, breaking changes are allowed and bump the **minor** (`0.x` is treated as unstable). Call the break out explicitly in the commit body / release notes.

Publishing is automated: push the commit **and** the tag (`git push --follow-tags`). The `v*` tag triggers `.github/workflows/release.yml`, which re-runs lint/typecheck/build/unit tests, verifies the tag matches `package.json`, and runs `npm publish` (OIDC trusted publishing + provenance). End users get it via `npx cpu-game-mcp@latest`.

## Git

Omit the `Co-Authored-By: Claude ...` trailer from commit messages.

Keep commit messages short: a single subject line capturing the essence. Add a body only when something genuinely needs explaining.
