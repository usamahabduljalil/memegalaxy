# ZeroDev wallets

MEMEGalaxy uses ZeroDev Wallet React with Wagmi for email OTP, passkey wallets,
and EIP-6963-discovered external Ethereum wallets. The public project ID is
configured through `VITE_ZERODEV_PROJECT_ID`. Email sign-in is paused by default;
set `VITE_ZERODEV_EMAIL_ENABLED=true` only after ZeroDev support resolves OTP
and a real email delivery and verification check succeeds. No wallet or platform private key
is shipped to the browser. The SDK keeps its own protected signing session.

## Identity and authentication

The game API issues a five-minute, single-use SIWE challenge bound to the site
origin, wallet and Robinhood testnet 46630. Verification uses viem's deployless
EOA/ERC-1271/EIP-6492 verifier on that chain. Only a successful proof creates a
hashed, revocable 24-hour API session. Client-supplied wallet headers cannot
change its owner. Arena admissions and MCP tokens remain separate credentials.

New identities are `wallet:<lowercase address>`. They do not inherit Privy
profiles, agents, GUSD, or MCP grants. History stays intact. Rewards and escrow
claims whose immutable recipient is the verified wallet remain discoverable.
Connecting another wallet signs in to that wallet's separate profile.

## Smart account transactions

Embedded wallets use EIP-7702, preserving their EOA address. Prize approvals and
registration are one atomic EIP-5792 bundle, with exact token allowances. The
app polls the UserOperation until it receives a transaction receipt; a pending
operation must not be silently submitted again. External wallets confirm
individual transactions and pay test ETH gas. Escrow history is verified from
contract-address-filtered logs and recipient topics rather than the bundler's
transaction sender. Financial contracts and settlement permissions are unchanged.

ZeroDev's gas policy is distinct from entry fees and the hosted-model budget.
Sponsorship must be configured and verified for the applicable chain/actions.
The platform never promises sponsorship solely because a wallet is connected.

## Dashboard setup

- Enable wallet authentication and Robinhood testnet 46630.
- Allow exact origins: `http://127.0.0.1:5173`,
  `https://memegalaxy.usamahabduljalil21.chatgpt.site`, and
  `https://memegalaxy-staging-production.up.railway.app`.
- Restrict sponsored contract/function calls and set gas limits in the project.
- Passkeys use the current hostname as the relying party ID. Development,
  staging and production passkeys are separate; don't use `chatgpt.site` as a
  shared RP ID. Choose an owned custom domain before offering shared passkeys.

## Legacy recovery

Arc recovery is a wallet-operated onchain screen. It needs the original external
wallet and test USDC for gas, not a Privy profile. New email wallets cannot access
old embedded-wallet assets unless the owner separately has that original wallet.
MEMEGalaxy's earlier Robinhood claims and Stock Hunt allocations similarly keep
their original payout recipients. Assets are never moved during this cutover.

References: [ZeroDev quickstart](https://docs.zerodev.app/wallets/quickstart),
[email OTP](https://docs.zerodev.app/wallets/auth/email-otp),
[passkeys](https://docs.zerodev.app/wallets/auth/passkeys),
[signature verification](https://docs.zerodev.app/smart-accounts/sign-and-verify).
