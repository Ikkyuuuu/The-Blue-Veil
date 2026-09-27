# Deployment and operations

Status: the small demo was deployed and smoke-tested through a scoped CLI role on 27 September 2026. Both stacks completed, the CloudFront FREE subscription is ACTIVE, and the selected Nova Micro model completed a real queued reading with guardrails. See docs/VALIDATION.md for the scope and remaining checks. Keep actual identifiers, outputs, profiles, receipts and incident details in ignored local files. Commands below use placeholders or local environment values.

## Preflight

**Region:** the owner selected Thailand (`ap-southeast-7`). The backend now uses API Gateway HTTP API because Lambda Function URLs are unavailable there. CloudFront sends a private origin token from Secrets Manager; a Lambda authorizer and the API handler both check it before accepting forwarded network addresses. The backend stays closed until the edge secret ARN is configured. The edge stack and Bedrock guardrail remain in `us-east-1`.

**Capacity gate:** five functions reserve ten concurrent executions in total. AWS also requires 100 unreserved executions. Preflight checks regional capacity before deployment. Keep the reservation limits and two-worker SQS cap; a quota request is not approval and does not change those application limits.

1. Use a scoped temporary assumed-role session. Do not deploy as root or use an unrestricted SSO administrator for routine deployments. An administrator must provision the project deployment permissions, workload permissions boundary and staging buckets. Configure `DEPLOY_ASSET_BUCKET_PREFIX` and `WORKLOAD_BOUNDARY_ARN` privately to use the current CLI credentials and project-only staging buckets without creating CDK's default administrator execution role. Alternatively, review a custom CDK bootstrap policy before using the default synthesizer. Do not grant arbitrary administrative rights to routine CI.
2. Copy `.env.example` to `.env`, then configure `AWS_PROFILE`, `AWS_ACCOUNT_ID` and the intended region locally. Never put credentials in the file. Keep the expected account assertion enabled.
3. Run `npm ci`, import the selected generated deck and unchanged licensed back, `npm run assets:check`, `npm run build`, `npm test`, browser tests and `npm run check:public`. Run `npm run deploy:prepare-site` to stage only active runtime files; it excludes old deck versions, manifests, galleries and prompts.
4. Run `npm run deploy:preflight`. It verifies a temporary role and expected account without changing resources. CDK CLI commands must also receive the explicit profile.
5. Review the account's CloudFront Free-plan eligibility, unused subscription slots and supported rule/behavior configuration. The stack requests FREE only; a failed subscription must not be replaced by a paid tier implicitly. A short interval of ordinary resource billing can occur while resources are created before their subscription is active.

## Stack order

Project staging buckets must exist in Thailand and `us-east-1` when using `DEPLOY_ASSET_BUCKET_PREFIX`. The fallback synthesizer instead requires a reviewed CDK bootstrap in both regions. CDK assets contain backend code only. The following is an operator sequence, not a script that executes automatically:

```sh
npm run infra:synth
npx cdk diff TarotBackend --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE
npx cdk deploy TarotBackend --exclusively --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --outputs-file .private/backend-outputs.json
```

Supply the required `AlertEmail` parameter from ignored local configuration; never commit the address or include it in public logs. Confirm the SNS subscription email to activate service-alert delivery; an unconfirmed subscription does not deliver alarms. The backend initially refuses all origin tokens and generation remains disabled. Use its ApiHostname output for the edge stack:

```sh
npx cdk diff TarotEdge --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --parameters TarotEdge:ApiHostname=YOUR_API_HOSTNAME
npx cdk deploy TarotEdge --exclusively --app "npx tsx infra/app.ts" --profile YOUR_SCOPED_PROFILE --parameters TarotEdge:ApiHostname=YOUR_API_HOSTNAME --outputs-file .private/edge-outputs.json
```

The edge stack creates private assets, a signed S3 origin, authenticated HTTP API origin, WAF, the FREE subscription and a Bedrock guardrail in `us-east-1`. The Free-compatible firewall uses a single all-path IP rate rule (1,000 requests per five minutes); API Gateway separately throttles at five requests/second with a burst of ten. A path-scoped 60-second WAF rule was rejected by plan eligibility during deployment and is not in the final template. Managed cache/origin policies use CDK constants; confirm that the API cache maximum TTL is zero. Verify the subscription is ACTIVE and still FREE. Save CLI output only in ignored files; review failures before proceeding. Read subscription status with `aws pricing-plan-manager list-subscriptions` using a current CLI service model.

Update the backend with the edge AppOrigin, OriginSecretArn, GuardrailId and GuardrailVersion outputs, keeping `GenerationEnabled=false` until synthetic live validation is ready. Review the change set before execution. Upload only the contents of `.private/deploy/site/`, prepared by the runtime allowlist, to the returned assets bucket via the scoped CLI. Never sync all of `dist/` or `.private/`. Use `Cache-Control: no-cache` for HTML and short-lived caching for fixed-name scene/deck assets; Vite's hashed JS/CSS can use immutable caching. Do not upload source archives, manifests, galleries, prompts, .env, cdk.out, documentation or backend source. Runtime card images are necessarily downloadable by game players even though the source asset pack remains private.

Verify:

- Direct API requests with missing, wrong, duplicate or viewer-forged origin credentials fail, as do public S3 requests.
- CloudFront overwrites any viewer-supplied origin token with its private custom header. Its network function also overwrites the forwarded address. Cookie forwarding, CSRF and Origin checks work; `/api/*` is never cached. The frontend needs no AWS signing headers or credentials.
- Security headers are present; errors do not become cached HTML.
- Cross-user ID access fails, quota races remain bounded and generation-off responses are correct.
- The worker role can invoke exactly the selected US Nova Micro profile/destinations and configured guardrail, with the model's current terms/retention verified.

Then set GenerationEnabled=true for a controlled synthetic test, inspect response quality and aggregate usage, and perform a real queue/redelivery/deletion test. Turn it off again if any gate fails. No test should send real personal data.

## Local Bedrock development (optional)

The local server defaults to `READING_MODE=local`. To exercise real Bedrock, configure a scoped role plus `READING_MODE=bedrock`, `BEDROCK_GUARDRAIL_ID` and a numbered `BEDROCK_GUARDRAIL_VERSION`. These calls are billable. The local database is a local test ledger; it does not share the deployed budget counter. Do not run multiple local instances expecting a combined AWS budget. Real production calls must use the DynamoDB-backed deployment.

## Operational setup before public launch

- The backend connects DLQ/worker-error alarms to an SNS email subscription. Confirm delivery before relying on the alarms. The demo has account-wide actual-cost warnings at $5, $8 and $10, excluding credits/refunds; these also include unrelated account usage and are not a hard cap. Project cost-tag coverage remains a follow-up, especially for cross-region Bedrock charges.
- Confirm adequate CloudTrail management-event coverage without duplicating unrelated account trails. Decide non-content state recovery/backup requirements; content is intentionally excluded from backups.
- Run the English quality/safety dataset against the live model. Evaluate false positives and fail-closed moderation. Actual latency, Bedrock permissions and plan eligibility cannot be established by local synthesis.
- Confirm privacy/contact copy, model retention terms, public source/asset licensing and a private vulnerability-reporting channel.
- Enable repository secret scanning/push protection where available. Review all history before publishing. GitHub OIDC trust must name the actual protected repository/environment; do not use a wildcard repository trust policy.

## Emergency stop and recovery

To rotate the origin token, update the edge secret, force a CloudFront configuration update to resolve the new dynamic secret value, and allow distribution propagation. Flush the API authorizer cache and allow the application's 60-second cache to expire. Expect a controlled interruption during an uncoordinated single-token rotation; never publish the token in browser configuration. Read access to the CloudFront distribution configuration is also access to this credential and must be restricted to operators.

An operator can set state-table item `pk=control#generation` with `value.enabled=false` (and a fresh `rev`) to stop newly claimed paid work. Backend deployment parameter GenerationEnabled=false also denies new question acceptance. The worker's role can read the control item but cannot change it. Allow already-running requests to settle; stopping consumption does not cancel an in-flight model call.

For a service incident: disable new generation, pause the queue event-source mapping if necessary, inspect sanitized metrics and DLQ IDs, correct the failure, and resume gradually. Every generation attempt conservatively reserves cost, including ambiguous failures; never clear the spend ledger as a troubleshooting step. Never bulk-delete the queue or content table to hide an error.

For rollback, restore previous frontend objects from S3 version history and invalidate affected CloudFront paths, then redeploy the prior backend code/template. A Lambda version/alias-based release pipeline is a follow-up before frequent production releases; this initial stack uses direct function code updates. Preserve compatibility of stored state between releases. A source-code rollback must not restore expired questions or reset global spend counters.
