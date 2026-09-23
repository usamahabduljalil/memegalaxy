# MEMEGalaxy implementation status

The version-two implementation is isolated from Big Circle's Arc contracts, database records, replay format and recovery interface. Do not deploy it over the Arc game service or run the legacy worker with Robinhood addresses.

## Development

- `npm run dev`: browser frontend. `#training` runs clearly labeled local heuristic training agents; `#free` connects to the separate authoritative service.
- `npm run galaxy:server`: new service on port 2568. Uses `MEMEGALAXY_DATABASE_URL`, falling back to `DATABASE_URL`; new tables are prefixed `mg_`.
- `npm run galaxy:agent`: owner-operated reference agent. Requires `MEMEGALAXY_AGENT_KEY`. Optional `OPENAI_API_KEY`, `AGENT_MODEL`, `AGENT_PROVIDER_URL`. With no model key, uses the explicit local survival policy.
- `VITE_MEMEGALAXY_API_URL`: public new-service HTTP origin. Never point it at the legacy Arc service.
- `MEMEGALAXY_ADMISSION_SECRET`: at least 32 characters for production. `MEMEGALAXY_WEB_ORIGINS`: comma-separated permitted browser origins.

## Protocol

`POST /api/v2/free/admission` returns a room-scoped, short-lived token. `POST /api/v2/agents/admission` exchanges a scoped agent credential. Use `sdk/connection.ts` to join, receive identity and decoded observations, submit actions, and reconnect within the twenty-second window. The wire messages are `identity` and `frame`; frames use compact entity arrays and incremental food updates. Always decode them with `shared/galaxy/wire.ts`.

Action types: MOVE, WAIT, SPLIT, EJECT. Actions contain a monotonic `seq` and normalized `x,y` except WAIT. CHASE and ESCAPE are SDK strategies compiled into MOVE, never privileged engine commands. API keys are hashed and only returned at creation/rotation.

The v2 ruleset is `memegalaxy-v2.0.0`. Simulation state and client observations are distinct types. Observations omit hidden cells, RNG state and opponent intentions. Replays retain full authoritative state only on the server.

## Release gates

Testnet prize admission is enabled for controlled integration testing after explicit owner approval. Hosted wallet onboarding, mixed human/agent matches and full live recovery drills remain release gates. Real-money activity remains disabled. Pons funding is not represented as automatic USDC revenue.

Before cutover: reconcile and pause new Arc entries, retain old cancellation/claims, launch separate Robinhood staging services, complete funded human/agent matches, measure five 100-player rooms, verify mobile FPS and hosted Privy login. Never reuse a chain-specific escrow address on another network.

## Staging and verification — 22 September 2026

- Local development opens MEMEGalaxy. Production retains the legacy landing page until `VITE_MEMEGALAXY_LIVE=true`; the new experience is available with `?preview=memegalaxy`. This is a preview route, not a separate security boundary.
- The authoritative staging service is `https://memegalaxy-staging-production.up.railway.app`. Prize admission and the worker are enabled; epoch 1 is confirmed onchain. The new testnet contract addresses and deployment transaction hashes are in `deploy/robinhood-testnet.json`. The vault was seeded with 1,000 mock test USDC; this is not launchpad revenue.
- 48 existing gameplay/protocol/replay tests passed, plus four new runner tests covering reconnect sequencing, invalid responses, slow providers, and expired decisions. TypeScript is checked before packaging.
- Previous local socket verification sustained 500 connections in five rooms with p95 processing of 25.674 ms. The slowest connection received about eight updates/second; the nominal ten-update target still needs production load verification. No representative physical mobile device FPS result has been recorded.
- Test contracts passed twelve local scenarios. Hosted human/agent prize matches, payout/recovery drills, provider-backed live agents, and complete mobile onboarding remain release gates.
- The owner approved the separate worker's database and test-only signing-key references. Both services are configured; deployed registrar/operator/result roles and their test-ETH balances were verified using `scripts/galaxy-readiness.ts`. The deployer key stays local.

The runner uses the agent profile personality unless explicitly overridden. Model calls never block movement; failed, malformed, expired, and hidden-target decisions fall back to the local controller. Revoking the agent credential ends active access after the next server credential check. All provider credentials remain on the owner's runner.

## Epoch 1 incident — 23 September 2026

Robinhood testnet Epoch 1 had ten confirmed entrants but closed before `startEpoch`: the onchain record has zero arenas and no seed. All ten deposits and all ten 1-test-USDC entry fees were returned; the 1,000-test-USDC prize vault remained available. The worker had compared `eth_getBlockByNumber` on Robinhood (the L2 block height) against `block.number` stored by the Nitro contract (the Sepolia parent-chain height). This falsely declared the committed entropy expired.

The worker now reads the finalized Sepolia parent block and its hash, verifies chain ID 11155111, and uses those values for roster ordering. `SEPOLIA_RPC_URL` can override the public parent endpoint. Finality adds a delay after registration closes; the prize lobby explains this. Room creation allows 120 seconds after the onchain start, followed by a 60-second player join window. The worker's stale-room deadline covers both windows. Players cannot act before launch, and a room with fewer than three connected entrants is invalidated for refunds. Confirmed human entrants on the prize lobby are admitted automatically when their room becomes available.

Checks: `npx tsx scripts/diagnose-galaxy-epoch.ts` reads public epoch/refund and parent/L2 block state; `npx tsx scripts/galaxy-prize-room-test.ts` exercises a ten-entrant room including delayed creation, early actions, launch, and no-show invalidation; `npx tsx scripts/galaxy-hosted-smoke.ts` verifies hosted admission and WebSocket frames. The 52 unit tests and 12 contract scenarios pass. A complete hosted prize match with ten live owner-backed entrants and actual winner payouts remains a release gate.
