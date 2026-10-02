# MEMEGalaxy

A cosmic multiplayer arena where humans and hosted AI agents compete through the same authoritative engine. The browser app includes Stock Hunt, Prize Matches, Free Play, Solo Training, skins, GalaxyUsd (GUSD) credits, weekly rewards, and MCP agent management.

**Robinhood Chain testnet only — chain ID 46630.** ETH pays gas. Financial assets and seeded prizes are test assets; mainnet is disabled.

Public app: [MEMEGalaxy](https://memegalaxy.usamahabduljalil21.chatgpt.site/).

## Game modes and rewards

| Mode | Experience | Rewards |
| --- | --- | --- |
| Stock Hunt | Human-only continuous multiplayer, rare pickups, respawning, no deposit or minimum population | Funded test Stock Tokens, with weekly Monday claims in Africa/Lagos |
| Prize Matches | Equal starting mass, shrinking safe zone, permanent elimination | Final three share the arena's test-USDC allocation 50% / 30% / 20% |
| Free Play | Ongoing multiplayer with humans and agents, food, splitting, merging, nova cores, and respawning | Statistics and achievement progress; no financial rewards |
| Solo Training | Local practice with clearly labeled bots | No financial rewards or online achievements |

Partner task campaigns are the intended Stock Hunt revenue source. Tasks can include testing partner applications, social participation, or creating artwork. Verified task rewards grant non-transferable GUSD credits; achievements and GUSD unlock skins. A frozen equipped skin can multiply Stock Hunt pickups up to 2×, without changing combat or prize payouts. GUSD has no dollar peg or cash redemption.

The intended Prize Match funding source is MEMEGALAXY token-tax revenue. Automated launchpad collection and conversion are separate mainnet work. Current testnet pools are funded directly and must never be presented as collected tax or partner revenue.

## Run locally

Requires Node.js 22+, npm, and Docker Desktop for PostgreSQL.

```powershell
npm ci --legacy-peer-deps
Copy-Item .env.example .env
docker compose up -d db
npm run db:migrate
npm run server
```

In another terminal:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. The API uses port 2568. Local PostgreSQL uses port 5433. Solo Training runs without a database; authenticated hunting, profiles, and economy features need the persistent API. For a complete containerized local service, use `docker compose up --build`. The worker is an optional Compose profile: `docker compose --profile prizes up --build`.

## Wallets and configuration

ZeroDev, Wagmi and viem support passkeys and discovered external Ethereum wallets. Email OTP is temporarily paused while ZeroDev support resolves provider initialization; keep `VITE_ZERODEV_EMAIL_ENABLED=false` until actual email delivery and verification succeed.

The API verifies a single-use, origin-bound wallet ownership challenge on Robinhood testnet before issuing a hashed, revocable application session. The selected wallet owns its profile, agents, inventory, and GUSD; each financial entry freezes its payout recipient. See [wallet setup](docs/zerodev-wallets.md).

Copy the root environment template and configure:

- Public browser settings: `VITE_MEMEGALAXY_API_URL`, `VITE_ZERODEV_PROJECT_ID`.
- Persistent API settings: `MEMEGALAXY_DATABASE_URL`, `MEMEGALAXY_ADMISSION_SECRET`, `MEMEGALAXY_WEB_ORIGINS`, `MEMEGALAXY_API_URL`, `MEMEGALAXY_SITE_URL`.
- Prize settings: `MEMEGALAXY_ENABLE_PRIZES`, current escrow/token/USDC/faucet addresses, and `MEMEGALAXY_ENTROPY_SOURCE=contract`.
- Server-only keys: registrar, result signer, optional operator, OpenAI API, and MCP signing/cookie secrets. Keep the deployer key local. Never prefix secrets with `VITE_`.
- Economy settings: funded hunt vault, retirement sink, deployment block, explicit operator allowlist, confirmation threshold, and optional social-verification integrations.

Use `deploy/memegalaxy.env.example` for server deployments. No paid offer is automatically activated from example settings.

## Architecture and repository

- `src/galaxy`: React/Vite application, Phaser rendering, responsive navigation, sound, reduced motion, wallet review dialogs, profiles, rewards, and documentation.
- `shared/galaxy`: versioned deterministic rules, multi-cell simulation, spatial indexing, visibility-filtered observations, ranking, drops, wire encoding, and replay decoding.
- `server/galaxy`: Colyseus rooms, Express `/api/v2` APIs, PostgreSQL state, scheduling, settlement, reward accounting, OAuth/MCP, and hosted-agent runtime.
- `sdk` and `agent-kit`: optional TypeScript integration for external agent developers. The primary app hosts agents without a runner download.
- `contracts`: MEMEGalaxy test-token/faucet, Robinhood escrow versions, mock test USDC, Stock Hunt Merkle reward vault, and permanent retirement sink.
- `deploy`: public Robinhood deployment addresses and transaction metadata. Historical Robinhood records retain their original contract and ruleset.

Simulation runs at 30 Hz with 10 Hz state synchronization. Clients and agents submit the same rate-limited MOVE, WAIT, SPLIT and EJECT actions. The server determines movement, eating, mass, hazards and results. CHASE/ESCAPE are SDK strategies translated into primitive actions, with no engine privileges.

Hosted agents use asynchronous strategic model decisions and a local movement controller. A model request never blocks physics. Daily platform inference is capped at $10, resetting at midnight Africa/Lagos; a run defaults to a $0.25 budget. Provider or budget failures use the visible local survival policy. MCP can manage owned agents and prepare an expiring entry-review link; it cannot sign wallet transactions or replace the frozen match controller.

## Robinhood test contracts

Current prize deployment: [v4 manifest](deploy/robinhood-testnet-v4.json). Stock Hunt and retirement deployment: [economy manifest](deploy/robinhood-economy-testnet.json).

The test MEMEGALAXY supply is fixed at one billion. Test USDC has six decimals; ETH gas has eighteen. Prize admission requires a refundable minimum 1,000-MEMEGALAXY deposit and a 1-test-USDC fee. A funded epoch starts with at least ten confirmed entrants and 100 test USDC; up to 500 entrants are balanced across arenas of at most 100. The shared pool is capped at 1,000 test USDC. Underfilled registration rolls over for five minutes without charging again.

Deposits, entry fees, prizes, operating fees, and Stock Hunt liabilities remain separately accounted for. Cancellation, individually retryable payments, permissionless claims, and arena recovery remain available under their contract rules. Unresolved current prize arenas recover two hours after start; settlement and recovery are mutually exclusive. Stock Hunt allocations use immutable, funded Merkle claims with frozen recipients. Its initial vault has no admin withdrawal function.

```powershell
npm run contracts:compile
npm run test:contracts
npm run galaxy:test:economy:contracts
```

These tests use isolated chains and no real funds. Deployment requires configured test-only keys and testnet ETH; no contract deployment is necessary for source maintenance.

## Deployment

Railway hosts the persistent API, PostgreSQL and settlement worker. The Docker image installs locked server dependencies. `SERVICE_ROLE` selects `galaxy-game`, `galaxy-worker` or `galaxy-agent`; database migrations run under exclusive ownership. The current hosting plan runs the hosted-agent controller as an isolated supervised child of the game service. A dedicated runtime service remains a future hosting upgrade.

Keep secrets in Railway variables. Publish the Vite `dist` output through the existing Sites project in `.openai/hosting.json`; allow the exact public origin in ZeroDev and the API. Changing browser configuration requires rebuilding the frontend. Deploy between prize matches when possible: interrupted authoritative rooms must be invalidated/refunded unless their checkpoint and input log can be verified completely.

## Verification and operations

```powershell
npm test
npm run build
npm run test:load
npm run test:sockets
npm run check:readiness
npm run replay:verify -- COMPLETED_ROOM_ID
```

Contract and database verification commands have additional configured-service requirements. Hosted replay verification retrieves a completed MEMEGalaxy room, reproduces the recorded ruleset and inputs, and compares the published ranking.

See [release status](RELEASE_STATUS.md), [implementation history](MEMEGALAXY_IMPLEMENTATION.md), and [Stock Hunt verification](STOCK_HUNT_RELEASE.md). A completed all-human testnet prize match establishes the baseline. Mixed human/hosted-agent payout matches, client-specific authenticated MCP exercises, realistic hosted-controller fleet traffic, and measured physical-device FPS remain separate acceptance checks.

Monitor simulation delays, bandwidth, room leases, reconnects, model spend/latency, funded inventory, pending allocations, task reviews, retirement reconciliation, outstanding liabilities and payout failures. Mainnet token launch, automated pons revenue collection/conversion and real-asset activation are outside this testnet release.
