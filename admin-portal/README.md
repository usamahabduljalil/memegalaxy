# MEMEGalaxy private administration

The player app and admin app are separate builds. The public app never imports the administration entry point. The admin app is deployed to an owner-private Sites project, with an additional server-side wallet allowlist on every admin endpoint.

Admin URL: https://memegalaxy-admin.usamahabduljalil21.chatgpt.site
Player URL: https://memegalaxy.usamahabduljalil21.chatgpt.site

## Access

1. Open the admin URL while signed into the site owner's ChatGPT account.
2. Connect the external wallet already configured in `MEMEGALAXY_ECONOMY_ADMINS`.
3. Sign the ownership message. No token approval is required to sign in.
4. Use the operations sidebar. Retirement activation separately requires the contract-admin wallet and a testnet transaction.

The current operator wallet is `0x82EacD27A39A68f78e43a1C2e3F3b920b29a7652`. Site access alone grants no API privileges. Do not place keys in the frontend. Additional operators need both explicit private-site access and server-side allowlist membership.

## Operations

Overview; Stock Hunt reward configuration and pause; verified reward assets and funded balances; skin publishing, pricing and achievement requirements; task creation and scheduling; task pause/resume; proof approval/rejection with reasons; append-only GUSD adjustments; retirement rates and activation; audit history.

Existing escrow contracts and signer/treasury roles are unchanged. This panel does not grant a settlement signer treasury authority or expose service private keys. API role checks, versioning, idempotency and audit writes remain authoritative.

## Build and publish

Run the normal TypeScript check, then `node scripts/build-admin-site.mjs`. The script builds mode `admin` to `.local/admin-site/dist`, writes the admin identity from `admin-portal/hosting.json`, and adds noindex/robots metadata. The separate static Site checkout can then be committed and privately published. The public app uses the normal production build. Keep the existing Site identities unchanged.

The API's `MEMEGALAXY_WEB_ORIGINS` must include the exact admin origin; preserve all existing origins when updating it. The admin build offers external wallets only, avoiding passkey scope confusion between player and admin domains.

## Custom domain

`memegalaxy.site` requires domain registration and DNS control. It is not created by changing a Site slug. Once owned, attach it to the public Site and apply the returned DNS/verification records. Then update API allowed origins, wallet authentication origins, ZeroDev ACL and relevant callback/issuer links before promoting the new address. Keep the admin site private; a custom name does not provide access control.
