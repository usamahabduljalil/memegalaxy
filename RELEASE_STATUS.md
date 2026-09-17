# Release status — 17 September 2026

Big Circle has a working local client connected to deployed Arc testnet contracts and Railway services. The public funded beta is not yet released. Public registration and mainnet remain disabled. Epoch 1 is open for an invite-only registration test with the owner's funded wallet. A complete ten-player match is still required before release.

## Deployed and verified

- Railway PostgreSQL schema is migrated. Startup runs migrations under a database lock.
- Game API: https://big-circle-game-production.up.railway.app. Health returned `ok: true` and `leaderReady: true`.
- The settlement worker logs confirm its settlement loop is running. `SERVICE_ROLE=worker` selects its process independently of Railway start-command overrides.
- Privy public app ID and approved service secrets are configured. A connected player's profile was successfully saved through server authentication and PostgreSQL.
- Arc chain ID 5042002, canonical six-decimal USDC, deployed bytecode and administrator/registrar/settlement roles were checked onchain.
- Test DOMINATE: `0xfca34ecb7035216f2e60d8409bc97210b9a203b1`, fixed supply 1,000,000,000.
- Faucet: `0xf8ce23c2ffa7ec6946dd663b786210336d46cfbc`, funded with that supply.
- Escrow/prize vault: `0xd8137397cd87b9ea9efc7f48ae7f02beb6908a49`. The hosted lobby reported 120 test USDC received. These are seeded test funds, not Argus taxes.
- The deployer key remains local. Deployment transaction hashes are persisted before broadcast so interrupted runs can resume without duplicate transactions.
- The local client uses the hosted HTTPS/WSS service and deployed contract addresses. Public deployment metadata is in `deploy/arc-testnet.json`.

## Verification completed

- Production TypeScript/Vite build passed with dependency annotation and large-bundle warnings.
- 29 gameplay, economics, compact-frame, replay and invite-only authorization checks passed.
- 12 isolated Ganache escrow scenarios passed, including refunds, payouts, blocked recipients, 51 entrants split 26/25, signer restrictions, duplicate claims and independent timeout withdrawals.
- 500 loopback Colyseus connections across ten arenas sustained 899 simulation ticks in 30 seconds; each client received at least 299 updates. P95 processing was 27.46 ms against a 33 ms budget. P95 timer interval was 47.43 ms; bounded catch-up preserved the simulation rate. This excludes production database/auth load and WAN latency.
- The browser tools for lobby reading and free practice accept valid inputs and reject unexpected fields. Their registration now survives lobby polling.
- Desktop and 390-pixel browser layouts were exercised. Physical mobile touch and frame rate remain unverified.

## Remaining release gates

- The connected player wallet shows 10,000 test DOMINATE and 20 test USDC after funding and faucet use. Complete approvals, confirmed entry, cancellation and withdrawal flows through Privy.
- Complete real testnet multiplayer matches with at least ten confirmed entrants, including reconnects, rankings and automatic payouts. Practice bots do not satisfy this gate.
- Verify deployed database/RPC interruption handling, restart reconciliation, backup/recovery configuration and payout retries.
- Test 500 deployed connections and representative physical mobile performance.
- Configure the final frontend origin in Privy and Railway; publish through the existing Sites project after complete testnet matches succeed.

Isolated tests and successful contract deployment do not constitute a completed public-beta verification.
