# Local validation

Scene renderer and production checks validated on 27 September 2026. The unchanged backend/infrastructure checks below were last run on 26 September 2026. No AWS resources were created and no Bedrock invocation was made during these checks.

## Passed

- TypeScript check and production Vite/server build.
- 24 unit/infrastructure checks covering quotas, concurrent acceptance, idempotency, ordered draws, ownership, Bangkok midnight boundaries, refunds, cancellation, expiry, bounded generation, worker leases, fail-closed moderation, HTTP protections and synthesized cloud controls.
- Browser checks across desktop Chromium and an emulated iPhone viewport cover the scene-only entrance, on-table draws, refresh/resume, the complete paged interpretation (compared word-for-word with the server answer), deletion, private-path denial, three-candle exhaustion, persistent daily-limit message, reduced motion, Escape menu and inert HTML-like question text. Renderer checks cover active video playback, processed reduced-motion stills, WebGL context loss/restoration, playable fallback without WebGL, creator credit and the served MIT notice. Added screenshot comparisons confirm that each original flame disappears independently while neighboring flames remain unchanged, including reduced-motion redraws. After avoiding repeated uploads of the same decoded video frame, the six gameplay/candle/renderer checks passed again with normal timeouts. Browser tests force local sample generation and use a separate temporary local database and port.
- Production-build browser smoke test reached a result with all three supplied card images loaded, no media errors, no browser errors and the expected Content Security Policy. Space-to-advance, previous-dialogue and card-selection checks passed. About 20.25 MB of encoded resources were observed on the latest local first-reading path with the original video masters and lit still; this varies with loading/entry timing and is not a network-wide billing estimate. This path still exceeds the original 8 MB transfer target.
- All four animations use the original 1280 × 720 masters. FFprobe confirmed source loop timings and frame counts: exterior 174 frames / 7.25 s, entrance 246 / 10.25 s, interior 72 / 3 s, reading 192 / 8 s, all at 24 fps. Decoded-video SHA256 hashes match between every source and imported file, verifying no video pixel changes during import. The pixel effect runs live at 1200 × 672 with black edges; it introduces no additional video encode. Exterior and interior shader captures were inspected; existing stills and card files are unchanged.
- Manual screenshot inspection of desktop and phone layouts, including the exterior, draw and result states. QA images stay under ignored `.private/`.
- Asset validation: all 22 Major Arcana, the supplied back and required scenes are present. The import process copies the purchased PNGs unchanged.
- Pinned npm dependencies: audit reported zero known vulnerabilities at install time. Public-candidate checks exclude paid PNGs, local records and targeted credential/account/private-path patterns. CI includes a pinned full-history Gitleaks action, which has not yet run on GitHub.
- CDK synthesis completed with the regional warning described below; no deployment took place.

## Deployment and validation still outstanding

- The original Thailand default cannot use the current Lambda Function URL template. Read-only registry checks found the resource type absent in Thailand and present in Singapore. Resolve the region/API decision before deployment; preflight blocks the unsupported original region.
- Live DynamoDB contention, CloudFront/OAC request signing and cache isolation, Free-plan eligibility, Bedrock access/quality/retention/latency, failure alarms and cloud rollback require scoped-role AWS validation. Unit tests exercise the shared game rules with an in-memory transactional store; they do not substitute for those live checks.
- The UI has been tested with Chromium desktop/mobile emulation, not physical iOS/Safari, Firefox or screen-reader software. Loop seams and masked scene lighting still merit playback review on the final target devices.
- No public GitHub remote, push, software license selection, cloud subscription or deployment has been performed. Review staged files and complete history before the first public push.
