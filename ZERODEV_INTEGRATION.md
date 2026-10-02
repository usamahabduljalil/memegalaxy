# ZeroDev integration assessment — 2 October 2026

Status: the ZeroDev integration is implemented. Passkeys and external wallets are enabled; email OTP is temporarily paused pending provider resolution. See docs/zerodev-wallets.md for current setup. This assessment records the design choices.

## Recommended experience

Connect wallet opens a MEMEGalaxy-branded dialog with external wallets, email OTP, passkeys and optional Google login. After authentication, the header shows the saved player name or the checksummed wallet's first eight hexadecimal characters, such as `0x82EacD27`, and opens the account menu. Players retain editable names.

ZeroDev currently offers an embedded Smart Wallet SDK, so the application uses its wallet authentication. Its React hooks use Wagmi, viem and TanStack Query. External wallet connections are also supported through configured connectors and EIP-6963 extension discovery. Check each requested wallet, including Phantom's Ethereum account, on desktop and mobile; a listed connector does not prove every installed wallet version behaves correctly. [Smart Wallet](https://docs.zerodev.app/wallets), [quickstart](https://docs.zerodev.app/wallets/quickstart), [external wallets](https://docs.zerodev.app/wallets/auth/wallet-ui-kit/connect-wallet).

## Features suited to this project

- Email OTP and passkeys provide familiar onboarding. Choose the production passkey RP ID before enrollment; existing passkeys cannot be moved to a different RP ID. Use separate development credentials on localhost. [Passkeys](https://docs.zerodev.app/wallets/auth/passkeys).
- Sponsor approved entry, cancellation and claim gas with contract/function restrictions and per-wallet/project caps. Sponsorship pays network gas; the MEMEGALAXY deposit and 1 USDC entry fee retain their existing economics. Maintain a separate gas budget from the hosted-model budget. [Gas policies](https://docs.zerodev.app/api-and-toolings/infrastructure/gas-policies).
- Batch exact token approvals and escrow registration into one reviewed request, and batch token approval with retirement. Use atomic execution, explicit amounts, current quotes and confirmed transaction receipts. [Batching](https://docs.zerodev.app/smart-accounts/batch-transactions).
- Account recovery and carefully scoped session permissions can be added later. Keep explicit approval for each prize entry. Arena movement already uses authenticated offchain actions, so model controllers need no wallet keys. [Permissions](https://docs.zerodev.app/smart-accounts/permissions/intro).
- Evaluate Smart Routing Address for future mainnet funding. The documented Robinhood route includes USDG; it does not establish a route for our mock test assets or convert USDG into the escrow's USDC automatically. [Supported funding assets](https://docs.zerodev.app/onramp/smart-routing-address/supported-chains).

## Migration work

1. Create a ZeroDev project with Robinhood testnet 46630 enabled. Its supported-network list includes this chain. Allowlist the exact public, staging-review and local origins. Verify an actual sponsored request on that project before enabling it for players. [Networks](https://docs.zerodev.app/api-and-toolings/faqs/chains).
2. Put a wallet-provider interface behind GalaxySession, then implement ZeroDev hooks and external-wallet connectors. Continue using the app's existing account, transaction-history and review dialogs; the UI Kit documents several portfolio/confirmation components as forthcoming. [UI Kit status](https://docs.zerodev.app/wallets/auth/wallet-ui-kit/coming-soon).
3. Use server wallet-proof verification with nonce-bound, expiring wallet ownership challenges and application sessions. Validate contract-wallet signatures on Robinhood using ERC-1271/ERC-6492 as appropriate. Update MCP authentication and owner-backed runtime admission consistently. [Signature verification](https://docs.zerodev.app/smart-accounts/sign-and-verify).
4. Introduce provider-independent identity links while preserving existing owner IDs, onchain identity hashes, player IDs, GUSD ledgers, agents, inventories and historical recipients. Link an existing account through verified control of its current account and the new wallet. Do not infer identity from a matching email or copy private keys to our server. Keep Robinhood claims bound to their original recipients.
5. Evaluate 7702 mode on the enabled chain and supported wallets; it can add smart features while retaining an EOA address. A 4337 Kernel account has a different address. Existing funds, entries and weekly earnings stay with their original recipients unless the owner explicitly transfers available assets. Ordinary external-wallet connection alone does not activate sponsored smart-account execution. [Account modes](https://docs.zerodev.app/wallets/quickstart), [7702](https://docs.zerodev.app/get-started/eip-7702/quickstart).
6. Adapt transaction submission, user-operation confirmation and reconciliation. Existing escrow registration verifies the platform registrar signature and pulls funds from msg.sender; retirement follows the same caller-bound pattern. Contract redeployment is not expected from this inspection, but confirm registration, cancellation, retirement, claims and recovery with the chosen account mode before cutover.

## Setup and acceptance

Required input: a public ZeroDev project ID with Robinhood testnet enabled. Configure exact allowed origins, enabled login methods, a capped gas policy and any optional Google/WalletConnect settings. Keep any privileged credentials server-side.

Verify email/passkey and requested external wallets; new/existing account linking; nonce replay; wrong chains; rejected signatures; sponsored batch failures; original-wallet claims; wallet switching during reviews; MCP owner isolation; hosted-agent admission; and prize arena recovery. Deploy to staging before replacing the public login.

Current listed pricing is a free testnet Sandbox with 10,000 credits and a $69/month Launch plan. Usage and sponsorship charges are separate; check dashboard limits for the selected project. [Pricing](https://www.zerodev.app/pricing).
