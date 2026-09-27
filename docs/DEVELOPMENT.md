# Development guide

Setup, runtime behavior, validation and deployment notes for The Blue Veil. For the game, controls and creative influences, see the [README](../README.md).

## Runtime behavior

- Scene-first pixel game: a Space/tap entrance, floating reader dialogue, cards placed on the table, independent candle flames and optional synthesized ambience/dialogue sounds. The interpretation advances with Space or a click; Escape opens settings, credits and privacy. There is no website header, footer or reading dashboard.
- Sound is on by default and starts with the first click or keypress. Original retro character blips accompany the reader's text, vary slightly in pitch, stop when dialogue is skipped or paused, and stay silent for instant reduced-motion text. Soft wind becomes muffled inside the tent; footsteps follow the walking video's clock and stop on buffering, pause or skip. Each newly spent candle has a breathy snuff; successful card draws have a paper slide and a soft landing. Restoring a reading does not replay these effects. The speaker mutes all sounds together; later interactions respect that choice. Effects are synthesized locally into reusable buffers, with no downloaded samples or speech service.
- Each drawn card slides face down from the stack, lifts clear of the cloth and turns over in 3D before settling. The back, thin edge, changing light and table shadow follow the turn. Motion pauses with the game; resizing or enabling reduced motion settles the card immediately.
- Opening a card for inspection plays a short synthesized paper flick. It sounds once per newly focused card, stays silent for additional text pages of the same card, and follows mute and pause. Reloading a reading does not replay the sound.
- Inside the tent, Scott Buckley's **A Dragon's Lullaby (2023 Remaster)** plays quietly, lowers during reader dialogue and the orb ritual, and repeats with gentle edge fades. The original MP3 is loaded only after entering with sound enabled and an audio-unlocking user gesture. Playback pauses with the menu, hidden tab and mute, then resumes from its previous position. It is streamed through the shared audio mixer without decoding the whole song into a large JavaScript audio buffer.
- After the third draw, the reading orb starts at the beginning and completes at least one full pass of its eight-second clip. A slower answer waits for the end of the current loop before appearing. A soft synthesized hum swells with the orb's media clock and fades at the transition; it follows pause, buffering and mute. Restored finished readings skip the ritual, as do reduced-motion playback and unavailable media.
- While a card is explained, an enlarged copy appears at the center with its own two-color aura following the artwork's transparent edges. All 78 cards have a palette based on their mood, from violet/teal transformation for Death to gold/amber joy for The Sun. Navigation follows the current card and preserves reversals; reveal animations pause with the game and are skipped with reduced motion. Portrait screens place dialogue beneath the card.
- **78 selected generated cards**: 22 Major Arcana and 14 cards in each of Wands, Cups, Swords and Pentacles, with upright/reversed meanings. The gallery browses one suit at a time and loads images lazily. All original Knights, the original King of Cups, and original Page/Queen/King of Swords are retained.
- Every face uses the same 128:180 display proportions on the table, during flips, in the reading focus and in the gallery. Per-card outline masks hide the background outside each decorative frame and remove unequal image padding. Enclosed dark artwork and title panels remain visible; original image files are unchanged. Aura shadows follow the masked outline.
- Shared server-authoritative rules for local development and AWS: anonymous sessions, CSRF checks, ownership, atomic quotas, distinct random draws, idempotency, resume, cancellation, expiry, one-time failure refunds and bounded generation attempts.
- Local sample readings by default. The AWS adapter targets Bedrock Nova Micro and requires a versioned guardrail; live model invocation and quality remain unvalidated.
- CDK stacks for private S3, CloudFront/WAF Free plan, authorized HTTP API, DynamoDB, outbox/stream dispatcher, SQS worker and cleanup/reconciliation.

The game has not been deployed to AWS by this implementation. Model invocation quality, actual regional permissions, edge-plan eligibility and operational alerts still need live validation. The default cloud template leaves generation off.

The owner selected Thailand. The templates now use HTTP API and private origin-token authorization because Lambda Function URLs are unavailable there. Regional capacity, scoped deployment permissions and live security/model checks remain deployment gates; see the deployment guide.

## Run locally

Requirements: Node.js 22.12 or newer, npm, and FFmpeg with libwebp for asset import. No AWS account or credentials are needed for the local preview.

```sh
npm ci
npm run assets:import -- "path to purchased Pixel Tarot Deck" --back-only
npm run assets:import:generated -- "path to selected source galleries"
npm run dev
```

Open `http://localhost:5173`. The local preview identifies its sample mode in the game menu. Questions and session state persist in ignored `.private/dev-state.json`; never publish that file. Development binds only to loopback. Runtime secrets never belong in `VITE_*` variables or browser bundles.

Network abuse protection is enabled locally by default, using the socket address and a persistent ignored key beside the state file. Browsers on this machine share its local network allowance. Automated UI tests use their own ledger with `LOCAL_NETWORK_QUOTA=off`; the AWS API has no opt-out. See [network limits and privacy](NETWORK_LIMITS.md).

The scene files are owner-provided assets under `public/assets/scenes`. A fresh checkout needs those licensed scene files if they are distributed separately; consult ASSET_LICENSES.md. The application expects the scene filenames checked by `npm run assets:check`.

Animations use the original full-length 720p loop masters. The game applies the pixel effect live with local WebGL, avoiding a second compressed video export. To import the masters, install FFmpeg and run `npm run assets:scenes -- "path to Tarot_Game_Loops"` (or set `FFMPEG_PATH` to its executable). The importer copies video streams without re-encoding, strips audio/metadata, and preserves frame timing. The original videos already contain compression; the live effect cannot restore detail absent from them.

## Music credit

**"A Dragon's Lullaby" by Scott Buckley** — released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [www.scottbuckley.com.au](https://www.scottbuckley.com.au/).

The game uses the [2023 Remaster](https://www.scottbuckley.com.au/library/a-dragons-lullaby-2023/), self-hosted unchanged with runtime volume and repeat fades. The track adds approximately 6.73 MB when loaded. Its [attribution notice](../public/licenses/a-dragons-lullaby.txt), [full license](../public/licenses/CC-BY-4.0.txt) and [provenance manifest](../public/assets/music/manifest.json) accompany the game. No third-party music service is contacted while playing.

## Pixel-effect credit

The scene shader is adapted from [Video-to-Pixel-Art](https://collidingscopes.github.io/video-to-pixel-art/) by **Alan Ang / [collidingScopes](https://github.com/collidingScopes)**. Thank you for creating and sharing this tool. The adapted Acid palette, Bayer dithering and Sobel edge highlighting are covered by the [upstream MIT notice](../public/licenses/video-to-pixel-art-MIT.txt); source revision `773cbdea04cae8a3e87d2f273b1c2e5a41851085` is recorded in `src/pixel-shader.ts`.

The current settings are pixel size **1**, dither strength **0.52**, Acid palette, edge threshold **0.48**, edge intensity **0.25**, and edge color **RGB(0, 0, 0)**. The effect renders at a stable 1200 × 672 grid and scales with crisp pixel edges. It covers the tent, reader, orb and original candle flames/halos; card artwork and text remain unchanged. Only spent candles are masked onto the unlit plate, before the shared pixel effect. Only the active scene updates, reduced-motion mode uses the original lit still with the same candle states, and the earlier scene composition remains available if WebGL is unavailable or its context is lost. No external scripts or services are contacted for rendering.

Scene rendering follows `requestVideoFrameCallback` so the hidden source videos deliver their full 24 fps instead of relying on throttled playback-quality counters. Older browsers use a bounded animation-frame fallback. Paused and hidden pages stop scheduling scene frames; candle transitions can redraw without uploading the same video texture again.

At video loop boundaries or while the next clip loads, the renderer retains the last valid video frame instead of flashing the still image. The idle and reading clips blend over 650 ms after the incoming frame is ready, before applying the shared pixel effect. Pausing also pauses that blend; reduced motion deliberately uses the lit still. Original video files and their quality remain unchanged.

## Asset loading

Startup downloads the complete runtime library (about 158 MiB) before enabling play: all 78 faces, the back, four original videos, scene stills, font, and music. The exterior movie downloads first and plays through the same pixel renderer used by the game, with a silhouette-shaped blur over only the tent. The GPU softens the original texture in two small separable passes before the shared palette, dithering, and edge effect, so the blur also has the game's pixel texture. This reuses the uploaded movie frame and adds no second decoder or CPU video-frame copies. Trees and circus stay clear. There is no added camera drift or zoom. Loading shows actual completed-file and byte progress; reduced motion uses a still. When entry becomes available, the game adopts the running video and existing canvas without seeking, changing the crop, or recreating the graphics context; only the tent blur fades away. Its temporary GPU targets are then released. CSS blur remains only as the no-WebGL fallback. Failed downloads expose a retry that keeps successful files. Compressed media stays in page-lifetime Blob URLs so later scenes, cards, and music need no additional media requests; the normal HTTP cache can help subsequent visits. This is an up-front download, not an offline game: readings still require the API. The same runtime allowlist drives startup and deployment. No player content is cached by the loader.

## Card artwork and public source

The card back comes from [Pixel Tarot Deck by Chorline](https://chorline.itch.io/pixeltarotdeck). Extract a licensed copy locally and use the back-only import command above; it copies the back unchanged. The paid PNGs, original Aseprite files and source archive are not part of the public repository. See [ASSET_LICENSES.md](../ASSET_LICENSES.md). Do not remove these exclusions merely to make a build pass.

The faces were generated for The Blue Veil with OpenAI image generation. `assets:import:generated` defaults to `artifacts/` and selects Major Arcana v1, Wands/Cups/Swords v2, and Pentacles v1 from the dated source galleries. It verifies their manifests and writes full-resolution lossless WebP copies under a versioned asset path. Source PNGs remain unchanged. All galleries, runtime deck versions/manifests, and card-generation prompt pages stay outside Git for the owner's planned commercial asset pack; a fresh checkout needs the assets separately. Keep local private backups outside publishable paths and never use a force-add to include them. Reversed readings rotate only the display, and existing Major Arcana reading IDs remain compatible.

## Validate

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run check:public
npm run infra:synth
```

Browser tests save local QA images under ignored `.private/qa`. Unit/infrastructure tests use synthetic data and require no AWS calls. `check:public` uses Git's ignore rules, checks actually tracked files too, and rejects private card-artifact or generation-prompt paths in available commit history and direct tree checkpoints. CI fetches full history for this check. Run it before publishing; deleting a file from the latest revision does not erase previous copies. It reports filenames rather than secret values and complements the full-history Gitleaks scan in CI; neither is a guarantee that all possible sensitive information is detected.

See [docs/VALIDATION.md](VALIDATION.md) for measured results and the remaining live validation gates. Browser tests use a separate local-only server on port 5174 and do not consume the preview's allowance or call Bedrock.

## Deployment

See [docs/DEPLOYMENT.md](DEPLOYMENT.md). Use a scoped temporary role, explicitly verify the expected account, review infrastructure changes, and confirm the Free subscription before enabling generation. No public repository or remote is created automatically.

The proposed budget is a target, not a hard account-wide cap. Clearing cookies does not reset the shared network allowance, but changing networks or using VPNs can bypass it; global server-side attempt/spend limits remain independent. The network HMAC key adds one Secrets Manager secret (approximately $0.40/month plus API requests at the published standard rate). S3/storage, alarms and background work can incur small idle costs. Do not enable provisioned compute or inference capacity without revisiting the budget. See [AWS Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).

## Security and privacy

See [SECURITY.md](../SECURITY.md). Real questions/answers are only accessible for 24 hours, then removed by cleanup/TTL; deletion retains minimal quota state. Logs and queue messages must not contain player content. Browser identity uses an HttpOnly cookie. Daily network checks store HMAC identifiers, not raw IPs or device fingerprints, with DynamoDB encryption at rest. The live UI discloses shared-network limits, retention, cross-border AI processing and its reflective, non-predictive purpose.

The source code uses the repository's [MIT license](../LICENSE). Third-party assets retain their separate terms; the private generated card pack and purchased card artwork are not included in the source-code license or repository.
