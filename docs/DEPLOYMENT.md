# Deployment and operations

Status: infrastructure is implemented and can be synthesized locally; it has not been applied to an AWS account. Keep actual identifiers, outputs, profiles, receipts and incident details in ignored local files. Commands below use placeholders or local environment values.

## Preflight

**Region gate:** read-only CloudFormation registry checks found `AWS::Lambda::Url` unavailable in Thailand (`ap-southeast-7`) and available in Singapore (`ap-southeast-1`). The original default remains in source pending the owner's decision. Do not run the deployment sequence until the backend region, edge hostname constraint and local configuration are updated together, or the Thailand API is redesigned. Preflight refuses the unsupported original region.

1. Use a scoped temporary assumed-role session. Do not deploy as root. Bootstrap CDK permissions through the account administrator with a reviewed permissions boundary/role policy; do not grant arbitrary administrative rights to routine CI.
2. Copy `.env.example` to `.env`, then configure `AWS_PROFILE`, `AWS_ACCOUNT_ID` and the intended region locally. Never put credentials in the file. Keep the expected account assertion enabled.
3. Run `npm ci`, import the purchased deck, `npm run assets:check`, `npm run build`, `npm test`, browser tests and `npm run check:public`.
4. Run `npm run deploy:preflight`. It verifies a temporary role and expected account without changing resources. CDK CLI commands must also receive the explicit profile.
5. Review the account's CloudFront Free-plan eligibility, unused subscription slots and supported rule/behavior configuration. The stack requests FREE only; a failed subscription must not be replaced by a paid tier implicitly. A short interval of ordinary resource billing can occur while resources are created before their subscription is active.

## Stack order

CDK bootstrap must already exist in both the application region and `us-east-1`. CDK assets contain backend code only. The following is an operator sequence, not a script that executes automatically:

```sh
npm run infra:synth
npx cdk diff TarotBackend --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE
npx cdk deploy TarotBackend --exclusively --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --outputs-file .private/backend-outputs.json
```

The backend initially has no public origin permission and generation remains disabled. Use its ApiHostname output for the edge stack:

```sh
npx cdk diff TarotEdge --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --parameters TarotEdge:ApiHostname=YOUR_API_HOSTNAME
npx cdk deploy TarotEdge --exclusively --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --parameters TarotEdge:ApiHostname=YOUR_API_HOSTNAME --outputs-file .private/edge-outputs.json
```

The edge stack creates private assets, signed S3/Lambda origins, WAF, the FREE subscription and a Bedrock guardrail in `us-east-1`. Verify the subscription is ACTIVE and still FREE. Save console/CLI output only in ignored files; review failures before proceeding.

Update the backend with the edge AppOrigin, DistributionArn, GuardrailId and GuardrailVersion outputs, keeping `GenerationEnabled=false` until synthetic live validation is ready. Review the change set before execution. Upload `dist/` to the returned assets bucket via the scoped CLI. Use `Cache-Control: no-cache` for HTML and short-lived caching for fixed-name scene/deck assets; Vite's hashed JS/CSS can use immutable caching. Do not upload `.private`, source archives, .env, cdk.out, documentation or backend source.

Verify:

- Unsigned direct Lambda URL and public S3 requests fail.
- CloudFront POST hashing, cookie forwarding, CSRF and Origin checks work; `/api/*` is never cached.
- Security headers are present; errors do not become cached HTML.
- Cross-user ID access fails, quota races remain bounded and generation-off responses are correct.
- The worker role can invoke exactly the selected US Nova Micro profile/destinations and configured guardrail, with the model's current terms/retention verified.

Then set GenerationEnabled=true for a controlled synthetic test, inspect response quality and aggregate usage, and perform a real queue/redelivery/deletion test. Turn it off again if any gate fails. No test should send real personal data.

## Local Bedrock development (optional)

The local server defaults to `READING_MODE=local`. To exercise real Bedrock, configure a scoped role plus `READING_MODE=bedrock`, `BEDROCK_GUARDRAIL_ID` and a numbered `BEDROCK_GUARDRAIL_VERSION`. These calls are billable. The local database is a local test ledger; it does not share the deployed budget counter. Do not run multiple local instances expecting a combined AWS budget. Real production calls must use the DynamoDB-backed deployment.

## Operational setup before public launch

- Choose a private alert destination and connect it to the existing DLQ/worker-error alarms. Alarms currently have no notification actions. Create project-cost budget alerts at the reviewed thresholds; keep account-wide billing visibility separate.
- Confirm adequate CloudTrail management-event coverage without duplicating unrelated account trails. Decide non-content state recovery/backup requirements; content is intentionally excluded from backups.
- Run the English quality/safety dataset against the live model. Evaluate false positives and fail-closed moderation. Actual latency, Bedrock permissions and plan eligibility cannot be established by local synthesis.
- Confirm privacy/contact copy, model retention terms, public source/asset licensing and a private vulnerability-reporting channel.
- Enable repository secret scanning/push protection where available. Review all history before publishing. GitHub OIDC trust must name the actual protected repository/environment; do not use a wildcard repository trust policy.

## Emergency stop and recovery

An operator can set state-table item `pk=control#generation` with `value.enabled=false` (and a fresh `rev`) to stop newly claimed paid work. Backend deployment parameter GenerationEnabled=false also denies new question acceptance. The worker's role can read the control item but cannot change it. Allow already-running requests to settle; stopping consumption does not cancel an in-flight model call.

For a service incident: disable new generation, pause the queue event-source mapping if necessary, inspect sanitized metrics and DLQ IDs, correct the failure, and resume gradually. Every generation attempt conservatively reserves cost, including ambiguous failures; never clear the spend ledger as a troubleshooting step. Never bulk-delete the queue or content table to hide an error.

For rollback, restore previous frontend objects from S3 version history and invalidate affected CloudFront paths, then redeploy the prior backend code/template. A Lambda version/alias-based release pipeline is a follow-up before frequent production releases; this initial stack uses direct function code updates. Preserve compatibility of stored state between releases. A source-code rollback must not restore expired questions or reset global spend counters.
