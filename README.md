# The Blue Veil

A cinematic pixel-art tarot game: step into a mysterious tent, ask a question, draw three cards, and reflect on their story. Three candle flames represent three questions per browser per Bangkok calendar day.

## Current implementation

- Scene-first pixel game: a Space/tap entrance, floating reader dialogue, cards placed on the table, independent candle flames and optional synthesized ambience/dialogue sounds. The interpretation advances with Space or a click; Escape opens settings, credits and privacy. There is no website header, footer or reading dashboard.
- Enable the speaker icon for original retro character blips as the reader's text appears. Blips vary slightly in pitch, stop when dialogue is skipped or paused, and stay silent for instant reduced-motion text. The speaker controls dialogue, ambience and card chimes together; no audio samples or speech service are needed.
- **22 Major Arcana** from the owner's purchased Pixel Tarot Deck by Chorline. Minor Arcana are intentionally absent until the owner supplies them.
- Shared server-authoritative rules for local development and AWS: anonymous sessions, CSRF checks, ownership, atomic quotas, distinct random draws, idempotency, resume, cancellation, expiry, one-time failure refunds and bounded generation attempts.
- Local sample readings by default. Real AWS mode uses Bedrock Nova Micro and a required versioned guardrail.
- CDK stacks for private S3, CloudFront/WAF Free plan, IAM Function URL, DynamoDB, outbox/stream dispatcher, SQS worker and cleanup/reconciliation.

The game has not been deployed to AWS by this implementation. Model invocation quality, actual regional permissions, edge-plan eligibility and operational alerts still need live validation. The default cloud template leaves generation off.

The original Thailand backend region also lacks the Function URL CloudFormation resource this design needs. A Singapore deployment or a Thailand API redesign must be chosen before cloud deployment; see the region gate in the deployment guide.

## Run locally

Requirements: Node.js 22.12 or newer and npm. No AWS account or credentials are needed for the local preview.

```sh
npm ci
npm run assets:import -- "path to purchased Pixel Tarot Deck"
npm run dev
```

Open `http://localhost:5173`. The local preview visibly labels its sample interpretations. Questions and session state persist in ignored `.private/dev-state.json`; never publish that file. Development binds only to loopback. Runtime secrets never belong in `VITE_*` variables or browser bundles.

The scene files are owner-provided assets under `public/assets/scenes`. A fresh checkout needs those licensed scene files if they are distributed separately; consult ASSET_LICENSES.md. The application expects the scene filenames checked by `npm run assets:check`.

Animations use the original full-length 720p loop masters. The game applies the pixel effect live with local WebGL, avoiding a second compressed video export. To import the masters, install FFmpeg and run `npm run assets:scenes -- "path to Tarot_Game_Loops"` (or set `FFMPEG_PATH` to its executable). The importer copies video streams without re-encoding, strips audio/metadata, and preserves frame timing. The original videos already contain compression; the live effect cannot restore detail absent from them.

## Pixel-effect credit

The scene shader is adapted from [Video-to-Pixel-Art](https://collidingscopes.github.io/video-to-pixel-art/) by **Alan Ang / [collidingScopes](https://github.com/collidingScopes)**. Thank you for creating and sharing this tool. The adapted Acid palette, Bayer dithering and Sobel edge highlighting are covered by the [upstream MIT notice](public/licenses/video-to-pixel-art-MIT.txt); source revision `773cbdea04cae8a3e87d2f273b1c2e5a41851085` is recorded in `src/pixel-shader.ts`.

The current settings are pixel size **1**, dither strength **0.52**, Acid palette, edge threshold **0.48**, edge intensity **0.25**, and edge color **RGB(0, 0, 0)**. The effect renders at a stable 1200 × 672 grid and scales with crisp pixel edges. It covers the tent, reader, orb and original candle flames/halos; card artwork and text remain unchanged. Only spent candles are masked onto the unlit plate, before the shared pixel effect. Only the active scene updates, reduced-motion mode uses the original lit still with the same candle states, and the earlier scene composition remains available if WebGL is unavailable or its context is lost. No external scripts or services are contacted for rendering.

## Paid deck and public source

Purchase the [Pixel Tarot Deck from Chorline](https://chorline.itch.io/pixeltarotdeck), extract it locally and run the import command. It copies the reworked PNGs without modifying them. The paid PNGs, original Aseprite files and source archive are not part of the public repository. See [ASSET_LICENSES.md](ASSET_LICENSES.md). Do not remove these exclusions merely to make a build pass.

The visible card back and faces are unchanged original artwork. Reversed readings rotate the display; source files remain byte-for-byte unchanged. Adding Minor Arcana later requires supplied artwork, catalog meanings and an updated deck version, plus draw-pool tests. Old stored readings retain their card IDs.

## Validate

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run check:public
npm run infra:synth
```

Browser tests save local QA images under ignored `.private/qa`. Unit/infrastructure tests use synthetic data and require no AWS calls. `check:public` uses Git's ignore rules, checks actually tracked files too, and reports filenames rather than secret values. It complements the full-history Gitleaks scan in CI; neither is a guarantee that all possible sensitive information is detected.

See [docs/VALIDATION.md](docs/VALIDATION.md) for measured results and the remaining live validation gates. Browser tests use a separate local-only server on port 5174 and do not consume the preview's allowance or call Bedrock.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Use a scoped temporary role, explicitly verify the expected account, review infrastructure changes, and confirm the Free subscription before enabling generation. No public repository or remote is created automatically.

The proposed budget is a target, not a hard account-wide cap. Per-browser limits can be bypassed by clearing cookies; global server-side attempt/spend limits are independent. S3/storage, alarms and background work can incur small idle costs. Do not enable provisioned compute or inference capacity without revisiting the budget.

## Security and privacy

See [SECURITY.md](SECURITY.md). Real questions/answers are only accessible for 24 hours, then removed by cleanup/TTL; deletion retains minimal quota state. Logs and queue messages must not contain player content. Browser identity uses an HttpOnly cookie rather than fingerprinting. The live UI discloses cross-border AI processing and its reflective, non-predictive purpose.

This project is not yet assigned an open-source license. Public visibility alone does not grant redistribution rights to the paid card art.
