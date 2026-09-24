# usurp.

One throne. Zero loyalty. A complete Foundry + Next.js 14 monorepo targeting **Monad testnet**, chain **10143**, with 6-decimal mock USDC and MON for gas. The public testnet has not been deployed by default; its address manifest intentionally contains null addresses until you deploy.

## Requirements

- Node.js 22 or newer, pnpm 9.15.9.
- Official Foundry **v1.8.3** or newer on PATH. Monad execution is enabled in `foundry.toml`, with Solidity 0.8.31 and the Osaka EVM target.
- Installation: `npm install --global pnpm@9.15.9`; install Foundry from [the official distribution](https://getfoundry.sh/introduction/installation/). Windows users can extract the [official Windows release](https://github.com/foundry-rs/foundry/releases/tag/v1.8.3) and add its directory to PATH.
- Network details: [Monad testnet](https://docs.monad.xyz/developer-essentials/testnet) and [Monad Foundry configuration](https://monad.docsbot.app/tooling-and-infra/toolkits/foundry).

## Install and test

Run from the repo root:

```sh
pnpm install
pnpm contracts:install
pnpm test:contracts
pnpm test:web
pnpm typecheck
pnpm check:brand
```

`pnpm contracts:install` installs pinned OpenZeppelin 5.2.0 and forge-std 1.9.7 without submodules. The contracts are independently buildable:

```sh
cd packages/contracts
forge build
forge test -vvv
```

The contract tests include 18 takeovers followed by a settle, with every unit accounted for across refunds, house fees, payout, and rollover; multiple refund price levels; fee-cap fuzzing; both settle gates, settling by anyone, taking an expired throne (settles it and opens the next round), four back-to-back rounds with every unit conserved, owner top-ups that never reset a live round; first take; pause/unpause; owner restrictions; Unicode taunts; self-takes; transfer rollback; and a delayed claim on a tiny pot.

## Run the demo

```sh
pnpm dev:demo
```

Open http://localhost:3000. No wallet or blockchain connection is needed. Alternatively set `NEXT_PUBLIC_DEMO=1` in `apps/web/.env.local` and run `pnpm dev`.

`npm run dev` also works from the root after dependency installation; its launcher resolves Next.js directly and does not require pnpm on PATH. To force demo mode with npm, run `npm run dev:demo`. If dependencies have not been installed, run `npx pnpm@9.15.9 install` once first.

The simulation uses integer USDC accounting, the same 5-minute timer and 300-block gate, and a shared `Game` interface with live mode. Fake players take over every 20–60 seconds. You can take the throne, leave a taunt, see automatic refunds, and share an eviction. The first visit opens the onboarding walkthrough; **enter demo** simulates a connected wallet. From the wallet chip in the header, **preview a winner** advances the simulation to expiry and **restart demo** resets it. Demo rounds start at $10 and end after 14 takeovers, so pots stay between roughly $3k and $15k. Round state resets on a full page reload.

Routes:

- `/`: the whole app. Throne, rolling pot and timer, holding fee, the 3D take button, the taunt modal, the takeover ticker, and winner state. There are no other pages and no tabs.
- `/api/og/eviction?victim=someone&taker=you&reign=154&profit=2.34&pot=12842.69&taunt=nice%20chair`: 1200×675 PNG.
- `/api/og/winner?name=you&payout=10531.01&round=1`: 1200×675 PNG.

Onboarding is a full-screen overlay on `/`. It opens on the first visit (completion is stored as `usurp.onboarded=1` in localStorage), **how it works** in the header replays it, and **connect** reopens only its wallet steps. Steps 1 to 8 are a scripted practice round with fake numbers, including the payment split and the honest explanation of where the money comes from. Step 9 connects a wallet: Rabby, Phantom, MetaMask, Coinbase Wallet and Rainbow connect when installed (discovered through EIP-6963) or link to their download page, WalletConnect appears when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, and a wrong network gets a switch-or-add-chain action. Step 10 approves USDC for exactly one take at the current price; every later take re-approves its own exact price, so a price that moves while the wallet is open can never spend more than the user saw. In demo mode the same wallet rows and approval are simulated and nothing is signed. While onboarding is open, the live 3D button stops rendering, so only one WebGL context is active. Wallet, USDC and Monad marks are the official icons from web3icons (MIT), saved under `apps/web/public/wallets` and `apps/web/public/tokens`.

## Deploy to Monad testnet

1. Copy `.env.example` to `.env` at the root. Set `PRIVATE_KEY` to a dedicated testnet deployer and `HOUSE_ADDRESS` to your house address. These files are git-ignored. Never prefix a private key with `NEXT_PUBLIC_`.
2. Fund the deployer with test MON from [Monad's faucet](https://faucet.monad.xyz).
3. Run:

```sh
pnpm deploy:testnet
```

This checks the RPC's chain ID, deploys `MockUSDC` and `Usurp`, mints the seed to the deployer, approves it, and seeds round one. The default seed is 1,000 mock USDC and the start price is 10 mock USDC. `SEED_USDC` and `START_PRICE_USDC` accept human-readable amounts with up to six decimal places.

`packages/contracts/script/Deploy.s.sol` writes `apps/web/public/deployments/monad-testnet.json`. The wrapper verifies the mined creation receipt and writes its actual block number for indexing. It restores the previous manifest if deployment fails. If a broadcast partially fails, inspect the receipts under `packages/contracts/broadcast` before retrying; a retry can create new contracts.

The script rejects all chain IDs except 10143. Mock USDC's public mint is for testnet only. No mainnet deployment or private key is included.

## Run live mode

Create `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_DEMO=0
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_DEPLOYMENT_URL=/deployments/monad-testnet.json
# optional, enables WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

```sh
pnpm dev
```

The frontend reads the deployment JSON at runtime. Connect an injected wallet (or WalletConnect, if configured) in the onboarding step, switch to Monad testnet when asked, and use the wallet chip's menu to get test USDC. Test MON is still needed for gas. The take button handles allowance automatically and waits for confirmed approvals and takeover receipts. It uses exact allowances and rechecks the displayed price after approval; a raced takeover cannot spend more than the approved price.

Round state polls every three seconds and refreshes on `Taken`, `Claimed`, `Seeded`, `RoundStarted`, and pause events. The browser indexes historical events from the deployment block using adaptive RPC pages and a 64-block reorg overlap. The public RPC is sufficient for small test deployments; a production indexer should persist long histories on a server. No fabricated live activity is shown on indexing errors. The countdown runs on chain time: every poll measures the offset between the latest block's timestamp and the device clock, so every player's timer matches the chain even when a device clock is wrong.

Rounds run back to back with no operator. When the clock runs out and 300 blocks have passed since the last take, anyone can call `settle()`: it pays the holder (never the caller) their 82% and immediately opens the next round, with the 18% rollover as its pot, the start price as its price, and no clock until the first take. Taking an expired throne does the same in one transaction: it settles the finished round and makes the taker the first holder of the next one. The app shows **start the next round** for the case where the round ends and nobody takes. Pausing disables taking but never settling. `seedRound(seedAmount, startPrice)` is the owner's optional top-up: the first call opens round one; after that it only adds money to the current pot and sets the start price for empty thrones and future rounds. It never resets a holder, a price in play, or a clock. The owner must approve the seed USDC first.

## Accounting and deliberate choices

All amounts are unsigned integers in the token's six-decimal smallest unit. Division rounds down. Parameters are immutable constants with exactly the requested values:

```text
next price      = paid × 135 / 100
gross refund    = previous paid × 10,200 / 10,000
hold fee        = previous paid × 200 × elapsed seconds / 36,000,000
net refund      = gross refund − min(hold fee, gross refund)
house fee       = paid × 250 / 10,000
pot increment   = paid − net refund − house fee
gross winnings  = pot × 8,200 / 10,000
winner payout   = gross winnings − min(hold fee, gross winnings)
rollover        = pot − winner payout
```

- The first take has no refund, and starts the clock. A newly seeded empty throne has no deadline so the seed cannot become stranded without a holder.
- The holding fee accrues until eviction or settlement, including any wait after the deadline. Fees at settlement are retained with the 18% rollover; they are not counted twice. The additional cap at gross winnings prevents underflow or an unclaimable small pot after a long halt.
- A take at or after the deadline settles the finished round first (once the 300-block gate is met; before that it reverts), then opens the next round with the taker as its first holder. A settle at the exact deadline succeeds only if the 300-block gate is also met. The 300-block constant is unchanged on Monad (about 2 minutes); the separate time gate enforces 5 minutes.
- Taunts are limited to 140 Unicode scalar values, with valid UTF-8 enforced onchain. Self-takes are permitted because the specification says anyone may take.
- The immutable token is assumed to be standard, non-rebasing, non-fee-on-transfer USDC. Unsolicited direct token transfers are outside round accounting. There is no owner withdrawal or rescue function.
- Testnet mock minting is deliberately public. The game is not independently audited. The onboarding notice and `lib/geofence.ts` are stubs; server-side geofencing and legal review are required before mainnet.

## Verification and production build

```sh
pnpm test
pnpm test:integration
pnpm typecheck
pnpm check:brand
pnpm build
pnpm --filter @usurp/web start
```

`test:integration` launches a private local Anvil with Monad execution and chain ID 10143, generates fresh ephemeral keys in memory, runs the real deploy script, verifies the mined manifest, executes approve/take, settles into round two, checks an owner top-up, then restores the public testnet manifest. It never prints or saves the keys and never connects to the public network.

For browser checks, use Edge on Windows, or install Playwright's Chromium on Linux/macOS:

```sh
pnpm --filter @usurp/web exec playwright install chromium
pnpm test:browser
```

The browser suite starts an isolated demo server on port 3100, checks the onboarding walkthrough and its persistence, manual and automatic takeovers, the eviction notice, winner preview, single-viewport fit from 360px phones to 1280×720, and both OG PNG dimensions. Screenshots are written to the ignored `artifacts/` directory. The test runner sets `USURP_E2E=1` to use `.next-e2e`. Local production builds use `.next-production`, separate from the running development server's `.next` output. Vercel builds use the standard `.next` directory when `VERCEL=1`, which Vercel sets automatically. In Vercel, use the Next.js framework preset with Root Directory `apps/web` and leave the Output Directory at its default.

The GitHub Actions workflow runs contract tests, ABI drift checks, the local deployment integration, TypeScript, brand checks, production build, and browser tests.

## Brand and source layout

Your provided crown is in `apps/web/public/brand/`: the transparent PNG and the SVG with embedded raster artwork are retained unchanged. The SVG is used for the floating hero and takeover jolt. Holo is restricted to the crown, the dome of the take button, and holder names; gold is restricted to the pot (layered glass-gold text, no raster) and winner surfaces. The OG eviction outline is a stylized crown. Fonts: one sans family across the app, plus Space Grotesk for the timer, the bleed line and the button price. The intended sans is ABC Monument Grotesk from local files under `apps/web/public/fonts`; until those files exist, Schibsted Grotesk from Google Fonts stands in at the same weights (the swap point is marked in `apps/web/app/layout.tsx` and at the top of `globals.css`). External font outages fall back to system fonts.

The throne page is a single viewport: header, crown, holder line, pot, timer and the 3D take button fit in 100vh from 360px phones to 1280×720 with no page scroll. Recent takeovers run as a one-line ticker fixed to the bottom edge.

The take button is a react-three-fiber scene (`components/dome-scene.tsx`) inside a real `<button>` that owns every interaction. It renders on demand only, stops when the tab is hidden or the round is idle-disabled, and honours reduced motion. The pot, timer and button price roll with NumberFlow; the winner payout uses a slot-reel reveal.

```text
packages/contracts/src/        Usurp.sol, MockUSDC.sol
packages/contracts/test/       Foundry tests
packages/contracts/script/     Monad testnet deployment
apps/web/app/                  pages and OG routes
apps/web/components/           shared demo/live providers and UI
apps/web/lib/                  generated ABI, state machine, indexer, chain, share helpers
apps/web/public/deployments/   runtime address manifest
scripts/                      deployment wrapper, ABI sync, brand audit
```

After changing Solidity, run `forge build` in `packages/contracts` and `pnpm contracts:abi` at the root. Every supported environment variable is documented in `.env.example`; frontend variables must be present when Next.js builds.
