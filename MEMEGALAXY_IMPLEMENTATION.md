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

The current protocol-2 gameplay ruleset is `memegalaxy-v2.1.0`; `memegalaxy-v2.0.0` remains available for historical replay verification. Simulation state and client observations are distinct types. Observations omit hidden cells, RNG state and opponent intentions. Replays retain full authoritative state only on the server.

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

Checks: `npx tsx scripts/diagnose-galaxy-epoch.ts` reads public epoch/refund and parent/L2 block state; `npx tsx scripts/galaxy-prize-room-test.ts` exercises a ten-entrant room including delayed creation, early actions, launch, and no-show invalidation; `npx tsx scripts/galaxy-hosted-smoke.ts` verifies hosted admission and WebSocket frames. The 52 unit tests and 12 contract scenarios pass. A complete hosted prize match with mixed human and owner-backed agent entrants remains a release gate.

## Verified live prize match — 23 September 2026

Epoch 2 started after its Sepolia entropy block finalized. One prize room opened, and six entrants were observed connected during live gameplay. The public replay for room `Le8FMNWjG` independently reproduced 8,643 simulation ticks, 58 persisted chunks, and 9,719 recorded inputs; its ranking matched all ten published results. All ten entrants were human-controlled. The onchain arena status is Valid, with exactly three winner slots and 500/300/200 mock test-USDC rewards, all claimed. All ten deposited tokens were returned. The initial 1,000-test-USDC vault balance was exhausted by valid prizes, then topped up with another 1,000 mock test USDC for Epoch 3 in transaction `0x889b834936e1cc67af51621c22eff67eb0dfb4338949f7e1caf25a2c28dee8b0`.

The prize lobby now explains that Sepolia finality commonly adds about 15–20 minutes after registration closes. A mixed human/owner-backed-agent prize match and full live recovery drill remain release gates.

## Five-minute rollover and faster arena opening � 25 September 2026

The v3 testnet escrow is recorded in `deploy/robinhood-testnet-v3.json`. It reuses the same mock token, test USDC and faucet, but has a separate prize vault seeded with 1,000 mock test USDC. Underfilled registration windows now roll over for five minutes; initial registration and underfunded/paused rollovers remain twenty minutes. Its `entropyHash(epoch)` view returns the exact rollup `BLOCKHASH` value available to `startEpoch`, so the worker can start after the target block becomes available on Robinhood rather than waiting for Sepolia's finalized head. This is a testnet latency tradeoff: a parent-chain reorganization between the view and start causes the worker to invalidate every affected arena and refund entrants instead of playing with a mismatched published seed. The hash is persisted before the start transaction.

The old v2 escrow was paused for **new** entries in transaction `0xaa4dfdc715b1de1efa4b013112e6823d48343e6400757ccc6cc790bcf7b1902f`. Epoch 3 had one confirmed entry at cutover. Its owner can still cancel for exact token and entry-fee refunds using the previous-entry control in the prize lobby. No assets were moved. The old escrow also retains 1,000 mock test USDC in its unallocated prize pool; v2 exposes no withdrawal for that balance, so it is not counted in the new pool. Keep its contract address and cancellation path accessible.

The public API and worker now point to v3, with `MEMEGALAXY_ENTROPY_SOURCE=contract`. The worker refuses to start a new match using the old v2 external-hash path, because its value can differ from the contract's seed. The hosted lobby reports the active timing. Local v3 contract tests passed all twelve payout/recovery scenarios and verified the five-minute rollover and entropy hash. The new deployment opened Epoch 1 with 1,000 mock test USDC available. Its first two underfilled rollovers emitted deadlines of 10:57:24 and 11:02:25 UTC on 25 September, confirming the live five-minute window. A live ten-entrant v3 match is still needed to measure actual close-to-arena time and payout on this path.

A live testnet probe found the contract-visible hash after 54 seconds (three parent-height steps after its initial reading), and the value remained stable eight parent-height steps later. It differed from the hash returned for the same height by the Sepolia RPC; v3 deliberately uses only the contract-visible value for roster ordering. Probe transaction: `0x555fe039fd095524292ab26a9ce70f1983bc57704b6822768fbd8f32005a1a7e`. This is a latency check, not yet a complete ten-player prize match.
## Food and movement tuning — 25 September 2026

The current ruleset is `memegalaxy-v2.1.0`. Food grants 4 game mass rather than 1. A 100-mass cell moves at 340 world units per second rather than 230, with faster steering response; speed still falls with increasing cell mass. The client draws food larger and pulses a growth ring when authoritative mass increases. Cell radius remains `4 × sqrt(mass)`, so food and combat gains use the same size formula. The old v2.0.0 values remain selectable by the replay verifier for recorded matches.

Robinhood testnet v3 Epoch 1 completed with ten entrants, one valid arena, and 500/300/200 mock test-USDC prizes. All ten deposits and USDC obligations were claimed. Its Epoch 2 had zero entrants when new registrations were paused in transaction `0x76d9c67fab6296480f386e249488e8996cbb09c14eda1f7b5eaf66f3c819fdd5`. Existing contract claims and recovery remain callable. The separate v4 escrow at `0xb1364bfc81118bd2a945bd5a51bd340cce9aa920` binds entries to the v2.1.0 ruleset and was seeded with 1,000 mock test USDC; public deployment details are in `deploy/robinhood-testnet-v4.json`. This is a fresh prize pool; no prior user funds were moved.
