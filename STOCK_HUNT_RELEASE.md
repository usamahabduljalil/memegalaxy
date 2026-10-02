# Stock Hunt release — 2 October 2026

The local frontend and Robinhood testnet staging services implement Stock Hunt, account-owned skins, whole-number GUSD credits, tasks, permanent token retirement, weekly stock claims, editable names, and consolidated player documentation. Financial amounts are test assets; GUSD has no dollar peg or cash redemption. Mainnet remains disabled.

## Deployed economy

Public addresses and transaction hashes: [deployment manifest](deploy/robinhood-economy-testnet.json).

- Reward vault: `0xcdc2383eeae734ea8ab0b6f99e1fcc92bdcf4c58`.
- Retirement sink: `0xe9d53a3838805a3f499d04d9b40b1b98187cdfdc`.
- Administrator: `0x82EacD27A39A68f78e43a1C2e3F3b920b29a7652`. Administration requires this wallet to be linked to the authenticated account and selected.
- Vault seeded with one each of the verified Robinhood test TSLA, AMZN and NFLX assets. These are seeded funds, never described as launchpad revenue.
- Stock Hunt defaults: 3–7-minute drops, 60-second lifetime, 0.5-second contact, 0.01 base reward, five pickups per Lagos day, one frozen skin bonus capped at 2×.
- No fee, deposit or population minimum; one hunting session per owner and wallet. Human controllers only. Confirmed rewards survive death.
- Completed Monday–Sunday Lagos allocations unlock Monday 00:00. The first newly earned period unlocks 5 October 2026 at 00:00 Lagos. Claims require the frozen wallet and test ETH gas and never expire.

Paid skin prices, GUSD tasks and retirement exchange rates require explicit operator configuration. No economic offers were invented during deployment. Telegram and X credentials are optional; without configured, verified integrations, submissions require manual review. Link clicks never earn credits.

## Verification

- 85 project tests passed, including old prize gameplay/replays and new Stock Hunt respawns, collision ordering, protection, daily/week boundaries and Merkle proofs.
- Local EVM contract checks covered funded immutable weekly allocations, failed recipients, duplicate claims, fixed recipients, signer restrictions, permanent retirement, quote replay/rate invalidation and unchanged total supply.
- An isolated PostgreSQL schema verified concurrent ledger credits, overspending prevention, skin purchases, account/wallet session uniqueness, funded reservations, exactly-once awards, daily caps and frozen bonuses/recipients.
- Staging executed the full application flow against a disposable local chain and isolated database schema: task → review → GUSD → skin; quote → retirement → confirmed credit; authoritative collision → durable reward → Monday allocation → wallet claim. The scanner recovered a retirement without a browser-reported hash. Production users received no fixture rewards or credits.
- Five Stock Hunt rooms sustained 500 WebSocket clients, 15 Hz inputs, multi-cell simulation, 10 Hz visibility updates, drop reservations, leases and progress persistence. Latest successful run: p95 simulation 5.124 ms, broadcast 7.143 ms, total 10.988 ms; every client remained connected and the slowest received 382 updates in 40 seconds.
- Production build verification fixed conditional lazy-import CSS preloading so the hosted MEMEGalaxy design matches development.
- The optimized engine matched the previous implementation exactly for both existing rulesets, prize/hunt modes, 100 entrants and 600 ticks with movement, split/eject, food and nova interactions. Existing ruleset identifiers and escrow contracts remain intact.
- Mobile viewport checks verified viewport-filling arenas (including nested Stock Hunt), scroll/focus restoration on exit, lobby, searchable/deep-linked documentation, the More menu, sound and collapsible leaders. A 390×844 desktop-browser viewport measured 142 FPS in solo training; this is emulation, not a physical-phone performance certification.

## Operator setup

Open the economy panel with the allowed wallet. Assets show the vault balance, reservations and earned liabilities; worker-confirmed snapshots determine available drop inventory. Configure and publish skins and tasks only with intentional prices and issuance budgets. Review submissions with a reason; GUSD adjustments require a reason and an idempotency identifier.

Retirement setup has two steps: save a positive token/GUSD rate with a new version, then activate that saved version in the retirement contract using the administrator wallet. Expired/changed quotes require fresh review. Already confirmed conversions preserve their quoted credit. There is no withdrawal path from the sink.

For Telegram, configure `MEMEGALAXY_TELEGRAM_BOT_NAME` and `MEMEGALAXY_TELEGRAM_BOT_TOKEN`, register the website with BotFather, and give the bot administrator access to target groups/channels. For X, configure the official application's client ID, optional confidential-client secret, and exact frontend redirect URI. Only supported read scopes are requested. Credentials and PKCE verifiers stay encrypted server-side.

The worker scans confirmed logs under exclusive database ownership and maintains an event cursor. Funding and claim flags use one confirmed block; offers pause during RPC/database failures or historical backfill. Historical logs are reconciled without requiring archived ERC-20 state. Previously earned claims remain accessible when new drops are paused.

Use `Dockerfile.economy-verify` only for temporary staging probes. Normal services use `Dockerfile`; disable all verification/activation flags after the successful checks. No test-chain libraries are required in normal production images.

## HTTPS phone review

The staging game service also serves a compiled review frontend at `https://memegalaxy-staging-production.up.railway.app/?preview=memegalaxy#lobby`. It reuses the existing service rather than provisioning another one; normal worker images contain no frontend. Build with `npm run build`, package the explicit secret-free tree with `node scripts/package-railway-review.mjs`, then upload that tree to the staging game service using `--path-as-root --no-gitignore`. The normal `RAILWAY_DOCKERFILE_PATH=Dockerfile` is retained. Never upload the project root with `--no-gitignore`.

This HTTPS address is reachable from a physical phone; a computer localhost address is not. If Privy allowed origins are configured, add the exact staging origin to the same Privy app before phone sign-in. The review environment shares existing testnet accounts and real test assets. It is not the published Sites frontend.

## Remaining release checks

The new source/build is saved for review before public frontend publication. Real-account Stock Hunt entry, wardrobe, editable profile, physical-phone touch/FPS and the previously recorded hosted-agent/MCP checks still require user verification. Public frontend publishing remains gated by those checks. Integration credentials and live GUSD offers remain operator setup, not completed external integrations. Existing USDC prize contracts and legacy recovery are preserved.
