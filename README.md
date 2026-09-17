# Big Circle



An Arc-testnet multiplayer survival game. Combat changes **game mass**; deposits are returned. Funded play is disabled until all services and contracts are configured. Mainnet is explicitly rejected by the server, deployment script, and test-token contracts.



## Run locally



Requires Node.js 22+, npm, and Docker Desktop for PostgreSQL.



```powershell

npm install --legacy-peer-deps

Copy-Item .env.example .env

npm run dev

```



The browser app and free practice work without credentials. To run the game API in unconfigured mode:



```powershell

npm run server

```



For funded testnet epochs, configure `.env`, start PostgreSQL with `docker compose up -d db`, then run `npm run db:migrate`, `npm run server`, and `npm run worker` in separate terminals. Alternatively `docker compose up --build` runs all three services. Only one game service and one settlement worker instance are supported. Database advisory locks prevent duplicate leaders.



## Privy



Create a web app in the Privy dashboard, enable email sign-in, and allow `http://localhost:5173` and `http://127.0.0.1:5173` plus the final Sites origin. Set `VITE_PRIVY_APP_ID` and `PRIVY_APP_ID` to the public app ID. Set `PRIVY_APP_SECRET` only on the API service. Wallet creation uses Privy's embedded Ethereum wallet; users do not grant the game signing authority over their wallets.



Generate a random secret of at least 32 characters for `ADMISSION_SECRET`, shared only by server services. `WEB_ORIGINS` is a comma-separated allowlist of exact browser origins. Neither an email string sent by the browser nor a user-provided wallet address authorizes an entry.



## Arc testnet contracts



The environment template uses Arc’s documented USDC interface at `0x3600000000000000000000000000000000000000` ([official reference](https://docs.arc.io/integrate/infrastructure/indexing-events)). Verify it against the connected testnet before deployment; application transfers use six decimals. Native USDC gas uses 18 decimals and shares its underlying balance with this interface. Never add both representations as if they were independent balances.



Configure separate testnet `DEPLOYER_PRIVATE_KEY`, `RESULT_SIGNER_PRIVATE_KEY`, and `REGISTRAR_PRIVATE_KEY` secrets, and public `ADMIN_ADDRESS` and `OPERATIONS_ADDRESS`. Fund the deployer and result signer with testnet USDC for gas. Keep all keys outside Git and the browser environment.



```powershell

npm run contracts:compile

npm run deploy:contracts

```



The deployer issues exactly 1,000,000,000 **test** DOMINATE and transfers that supply to the faucet. Each wallet can claim 10,000 test tokens every 24 hours. The faucet uses existing supply, never inflation. The faucet is rate-limited per wallet, not a proof-of-person system.



The deployment script saves only public addresses to `.local/deployment.json`. Copy each address to its matching server variable and `VITE_` browser variable. Seed the escrow directly with at least 100 test USDC; top-ups are available to future epochs and exclude escrowed fees and reserved prizes. The first beta uses explicitly labeled seed funding, not an Argus tax integration. Set `ENABLE_PAID_EPOCHS=true` only after all services are healthy.



The browser requests exact token and USDC allowances and signs the entry transaction after showing a gas estimate. A cancellation returns principal and entry fee, not gas already consumed. Successful arena entry fees are owed to the fixed operations address. Anyone can call `payOperations()` to send accrued fees there.



## Railway and Sites



Create one Railway project with PostgreSQL, a game service, and a settlement worker from this repository. Use the included Dockerfile, which installs only the locked server runtime dependencies. Public service IDs and settings are recorded in `deploy/railway-services.json`; apply these in Railway service settings (legacy `railway.json` is no longer accepted for new services). The game service runs `npm run server`; the worker overrides the start command to `npm run worker` and removes the HTTP healthcheck. Run `npm run db:migrate` as the pre-deploy command; migrations use a PostgreSQL transaction and advisory lock. Keep the PostgreSQL connection private and enable database backups. Expose HTTPS on game port 2567. The worker has no public port.



Configure server-only values on Railway; do not prefix private keys with `VITE_`. Set `VITE_API_URL` to the game HTTPS origin and `VITE_WS_URL` to the same host with `wss://`. Rebuild the frontend after changing public variables. Publish the static Vite `dist` output through the existing Sites project in `.openai/hosting.json` and set its access to public only for the completed beta. Add that exact origin to Privy and `WEB_ORIGINS`.



The game service acquires its database leader lock. During replacement deployments it can start in standby; funded entries remain disabled until the old process exits and leadership transfers. The worker also waits for its exclusive database lock. On restart, interrupted arenas become invalid and their entry fees become refundable. The worker reconciles signed transactions and chain state before submitting new operations. Run graceful deployments between epochs where possible; do not scale the game service beyond one instance without implementing shared Colyseus presence and routing.



## Interfaces and operational model



- `GET /api/lobby`: chain-confirmed epoch, prize funding, service readiness, and arenas.

- `GET /api/me`, `PUT /api/profile`: verified Privy player, display name, entries, and payout history.

- `POST /api/entry/authorize`: short-lived EIP-712 authorization for the verified embedded wallet and exact deposit.

- `POST /api/arenas/:id/admission`: 60-second, arena-specific admission credential for a confirmed entrant.

- `GET /api/arenas/:id/replay`: completed replay chunks, revealed seed, roster, result, and digest.

- Colyseus `arena` room: client `input` messages carry normalized direction and increasing sequence; server sends `identity`, an initial `snapshot`, compact `frame` updates, `result`, and `invalid` messages.



Clients never submit outcomes or authoritative positions. Simulation runs at 30 Hz; snapshots are sent at 10 Hz. Snapshot updates omit repeated roster metadata and stagger across arenas to reduce transmission spikes. Complete game rules are versioned in `shared/economics.ts` and `shared/game.ts`. Randomness combines the precommitted secret with a later chain block; assignment is reproducible. The result signer remains trusted to judge matches. Replays expose its decisions; they are not a cryptographic proof of fair execution.



The contract separates fee, prize, operations, and token liabilities. Arena settlement is bounded to three distinct members of that frozen arena. Refunds and prizes use fixed wallet recipients. Each token return and each USDC transfer is independently retryable. An unresolved arena can be recovered permissionlessly one hour after its scheduled deadline; valid arenas cannot be overwritten by recovery. Entries can be paused without disabling withdrawals. After the recovery deadline, a resolved arena’s deposits can be returned even if another arena remains unresolved. The wallet includes direct onchain entry lookup, cancellation, recovery, and claims that do not depend on the game API.



## Verification



```powershell

npm test

npm run test:contracts

npm run test:load

npm run test:sockets

npm run build

```



Contract tests use an isolated in-process chain with no real funds. The simulation benchmark measures ten arenas with 500 players. The socket benchmark adds 500 actual loopback Colyseus connections, isolated client workers, 30 Hz simulation, and 10 Hz compact updates. It is not a substitute for testing the deployed service over real mobile networks. Live Privy email delivery, funded Arc matches, Railway restarts, and representative physical mobile FPS require configured external services/devices and must be verified before announcing a public funded beta.



Monitor `/health`, `service_health`, arena heartbeats, replay persistence, `transactions` stuck in `submitted`, and signer gas. Inspect a pending transaction by its hash; never manually resend a different transfer without first resolving the original. Keep old epoch secrets and replay logs backed up. An expired entropy request closes that epoch for refunds instead of allowing the operator to reroll it.



## Mainnet is a separate release



Before real-money activation, inspect the actual Argus token and creator-reward contracts, confirm a USDC reward pair and creator allocation, verify whether transfers are taxed, implement and test the creator-fund forwarding adapter, independently review the contracts, and determine applicable operating-market requirements. The testnet code rejects fee-on-transfer deposits rather than silently undercollateralizing users. Do not put a creator wallet private key in the browser or send it through chat.



## Replay inspection



Download a completed arena’s replay JSON from the lobby, then run:



```powershell

npm run replay:verify -- path/to/replay.json

```



The verifier checks contiguous chunks, the canonical SHA-256 digest, and a deterministic rerun of every connection and movement event against the published standings. Canonical object-key ordering keeps hashes stable when PostgreSQL JSONB reorders keys. Verify the published digest against the arena settlement event on Arc. A matching replay establishes consistency with the recorded inputs, not that an operator recorded every real-world input honestly.



See `RELEASE_STATUS.md` for current verification and deployment gates.


For test-only role setup, `npx tsx scripts/setup-testnet-keys.ts` creates missing keys in ignored `.env` and prints only public addresses. It never overwrites existing keys. Administration and operations default to the test deployer and can be changed before contract deployment. Keep the deployer key off the hosted services.

## Controlled pre-release registration

`ENTRY_ACCESS_MODE=invite-only` is the default. Set `BETA_TESTER_WALLETS` to comma-separated invited public addresses on the game service. An empty or invalid invitation configuration cannot authorize entries. `ENABLE_PAID_EPOCHS=true` enables the testnet coordinator and entry path; keep invite-only restrictions during verification. Remove those restrictions with explicit `ENTRY_ACCESS_MODE=public` only after the release gates pass. Invitations are checked after Privy verifies wallet ownership and before any entry authorization is signed. Cancellation and withdrawals stay available regardless of invitation status.

The worker container needs `SERVICE_ROLE=worker`; game is the default image role. Both run locked schema migrations before starting. Public contract addresses are saved in `deploy/arc-testnet.json`.
