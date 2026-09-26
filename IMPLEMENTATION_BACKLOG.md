# Tarot tent — implementation backlog and acceptance checks

The criteria below remain the release checklist. Current implementation status:

- Implemented locally: cinematic scenes, supplied 22-card deck, question/draw/result flow, separate candle flames, deletion/resume, reduced-motion controls, privacy/attribution copy and generated ambient sound.
- Implemented in source: authoritative sessions/quota/draws, expiring content, idempotency, cancellation/refunds, queue worker, Bedrock/guardrail adapter and cost reservations.
- Verified: engine/HTTP and infrastructure unit tests; build and public-file checks. Desktop/mobile browser checks are recorded in docs/VALIDATION.md.
- AWS templates synthesize but are not deployed. The Thailand Function URL regional incompatibility requires a region decision or API redesign before deployment.
- Not yet verified live: scoped deployment identity, Free-plan eligibility, OAC end-to-end behavior, Bedrock quality/retention/latency, alert delivery or cloud rollback.

A source implementation is not evidence that an AWS launch gate has passed.

## P0 — validate the foundation

- Establish the scoped non-root CLI identity. Read the expected account ID from private configuration and assert it and the intended region before every deploy. Never silently fall back to a default profile.
- Prepare for a public GitHub repository: preserve ignored private records, use placeholder-only configuration examples, review staged files/history and scan for secrets before the first push. Keep account identifiers and personal machine paths out of public documentation.
- Record asset provenance/permissions, target repository, owner contact, beta URL and final deck rules. Use the CloudFront hostname until a domain is chosen.
- Prepare an infrastructure change set for the CloudFront Free plan, private S3 and IAM Function URL. Verify plan eligibility/configuration through supported APIs. Do not subscribe to a paid fallback implicitly.
- Prove API POST body hashing, cookie issuance/forwarding, same-origin checks, cache bypass and direct-origin denial with a minimal synthetic endpoint. Verify required security-header delivery and WAF rules fit the plan.
- Test one scoped synthetic Nova Micro invocation and guardrail input/output calls, recording latency, usage, cost and exact model/API retention behavior. Profile discovery alone does not pass this gate.

Exit: a priced, secure, working infrastructure path and a clear model/guardrail configuration, using no player data.

## P1 — complete the local game

- Implement the exterior, entrance, hooded-reader, draw and result states with fixture API responses.
- Prepare the unlit-candle interior and independent flames/glows; use one reusable orb pulse and extinguish effect.
- Integrate the supplied 22 licensed Major Arcana, back and deck; defer Minor Arcana until supplied. Confirm every card can be drawn in tests, with no repeats in a spread.
- Make desktop/phone controls accessible. Check keyboard-only use, Space in input, reduced motion, mute, skip, tab focus, readable result panels and screen-reader output.
- Optimize video/poster loading; measure real transferred bytes. Verify all loops, interior clip transitions and the once-only entrance on Chrome, Edge, Firefox and Safari/mobile Safari.

Exit: the full experience works locally without AWS, including daily-limit/error fixtures.

## P2 — implement authoritative game rules

- Session cookie, CSRF, ownership middleware and strict input validation.
- Transactional acceptance, Bangkok daily counters, one-active-reading lock and persistent idempotency.
- Server-selected cards and orientation, ordered draws, resume endpoint and immutable question/card metadata.
- Cancellation/deletion, logical expiry, bounded cleanup and exactly-once quota refund transition.
- Global reading/attempt/cost controls with operator-only configuration and an emergency stop.

Required tests: 100 concurrent distinct submissions for one visitor accept at most three over completed reading cycles; when the active-reading lock is held, others resume/conflict without quota charge. Same request ID and input always yields one reading. Reusing the ID with different input conflicts. Duplicate draw IDs reveal no extra card; out-of-order/fourth draws fail. Different visitors cannot read/draw/delete each other's records. Changing local time/cookies' client-side display cannot change a current session's server counter.

Boundary tests: 23:59:59/00:00:00 Bangkok; retry across midnight; old-day refund; 0→3 quota; daily-limit status and reset time; expired records still physically present; deletion while a worker is about to commit.

## P3 — connect safe generation

- Metadata outbox, dispatcher, queue, DLQ, worker lease and pending-job reconciliation.
- Exact selected-card prompt, curated meanings, versioned configuration, JSON validation and plain-text rendering.
- Input/output moderation, sensitive-topic responses, bounded paid attempts and cost reservations.
- Backoff polling and reconnect/resume without duplicate submission or redraw.

Required failure tests: dispatcher crash before/after send; duplicate stream/queue delivery; model throttling/timeout; malformed output; guardrail unavailable; worker crash after model response; canceled job delivered late; global budget exhausted; regional service error. Each outcome must remain bounded, observable and recoverable without an infinite paid retry.

Quality test set: at least 30 ordinary English questions covering relationships, work, uncertainty and decisions; at least 20 adversarial/sensitive prompts. Review faithfulness to all three cards, question relevance, tone, readable English, absence of certainty/manipulation, safety handling and consistency of structured output. Test question text that tries to change card IDs, reveal system text, return HTML or instruct tool use.

Exit: an end-to-end reading succeeds and deliberately induced failure paths respect quota, privacy and spend rules.

## P4 — security and release readiness

- Pass every SECURITY.md release gate and the local operational review; inspect IAM and infrastructure diffs without publishing private account findings.
- Verify public S3/origin access denied, CSP effective, headers on error responses, no API cache leakage, and no sensitive content in logs/traces/queues.
- Scan dependencies, committed artifacts and build output for secrets. Pin dependencies and CI actions; restrict future OIDC deploy trust to the selected repository/environment.
- When the public repository exists, configure available secret scanning/push protection and private vulnerability reporting. Verify `.gitignore` exclusions and placeholder examples. Do not assume ignore rules remove tracked content or history.
- Add privacy/AI/attribution pages and owner contact. State browser-limit bypass and content-expiry behavior honestly where relevant.
- Configure project cost alerts and a small set of useful failure alarms; verify the delivery destination with the owner during deployment.
- Exercise kill switch, queue pause, frontend rollback and Lambda rollback. Document accepted state-recovery limits.

Exit: all security gates pass and a measured monthly forecast fits the target with headroom.

## P5 — limited launch and measured expansion

- Launch with proposed 100 daily / 2,000 monthly global reading caps, the independent $2 AI/moderation allowance, and three questions per browser.
- Review actual token units, moderation units, read/write costs, media delivery, logs, error rate and completion time during beta.
- Adjust caps only from measured evidence. If guardrails, model quality or volume cannot fit the budget, reduce capacity or revise the budget; do not remove core protections silently.

## Deferred features

Accounts/sync, persistent journals, Thai/localized UI, voice dialogue, payments, user uploads, social sharing of questions, additional spreads, custom decks, vector search and complex model agents are outside the first release. Each changes cost, security or scope and should receive its own design pass.
