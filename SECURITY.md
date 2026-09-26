# Security and public repository policy

This project is in the design stage. The controls below are requirements, not a claim that a deployed service has passed an audit.

## Public and private material

Application source, infrastructure templates, synthetic tests and general architecture belong in the public repository. Credentials, player data, deployment configuration containing private values, resource inventories and account-specific security findings do not.

The root `.gitignore` excludes local environment files, credentials/private keys, infrastructure state/output, `.private/`, generated artifacts and the existing private planning records. Configuration examples must contain placeholders only. Ignore rules prevent ordinary addition of untracked files; they are not encryption, filesystem access controls, a complete secret scanner or a way to remove existing history.

All browser code and frontend build-time variables are public. An ignored environment file does not make values injected into a JavaScript bundle private. AWS access belongs on the backend, with scoped temporary credentials and role-based permissions.

## Required application controls

- HTTPS and secure HttpOnly session cookies; same-origin mutation checks and CSRF protection.
- Authorization of reading ownership on every endpoint; no client authority over cards, quota, dates or budget.
- Transactional daily quotas, idempotency, bounded paid retries and independent global generation/spend limits.
- Private S3 assets behind CloudFront; an IAM-protected API origin restricted to the intended distribution.
- Least-privilege workload roles, a non-root deployment identity and tightly scoped future CI federation.
- Validated model input/output, safe text rendering, content moderation and no model access to tools or arbitrary network actions.
- Minimal content retention, cancellation/deletion safeguards, and no player content or tokens in logs, queues or traces.
- Security headers, dependency review, secret scanning and tested failure/recovery behavior.

The design must remain secure when its source and general controls are known publicly. Hiding source code is not an authorization control.

## Release gates

1. Verify deployment identity, IAM scope and absence of credentials in source and browser bundles.
2. Test direct-origin/S3 access denial, cross-user isolation, CSRF and script injection.
3. Test quota races, duplicate submissions/deliveries, midnight rollover, refunds, expiry and deletion races.
4. Test adversarial/sensitive model inputs, output validation, moderation failure and bounded spend.
5. Inspect sanitized logs/queues/traces and validate rollback, emergency stop and alert delivery.
6. Review the actual staged files and history, asset redistribution rights, privacy copy and current cost forecast before publication/release.

## Reporting a vulnerability

Do not put exploit details, credentials or player data in a public issue. Before publishing the repository, the maintainer must enable GitHub private vulnerability reporting or provide a private security contact here. That reporting channel has not yet been configured.

If a credential is exposed, revoke or rotate it promptly, investigate its use and remove it from any history being published. Adding its filename to `.gitignore` afterward does not undo exposure.
