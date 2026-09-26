# Project instructions

## Product decisions

- This game is intended for a PUBLIC GitHub repository.
- Launch in English; the monthly AWS planning target is US$10. Worldwide Bedrock processing is acceptable.
- Initial model candidate: Amazon Nova Micro via `us.amazon.nova-micro-v1:0`. It still needs invocation/quality validation; do not imply it is deployed.
- Use AWS through the CLI and a verified scoped identity. Do not use the browser for AWS administration unless the user changes that preference.
- Follow GAME_PLAN.md and IMPLEMENTATION_BACKLOG.md for the game design.
- Current deck: use the supplied Pixel Tarot Deck reworked Major Arcana artwork and card back. Only the 22 major arcana are active; the owner will supply minor arcana later. Do not replace these with generated celestial symbols or mix in placeholder minor cards. Keep deck image files ignored until redistribution rights are verified.

## Public repository boundary

- Keep credentials, session tokens, private keys, raw player questions/answers, live account identifiers, internal resource inventories and account-specific security findings out of tracked files, commit messages, public issues, PRs and CI logs.
- Store new private operational notes/configuration under `.private/` or an ignored `.env`/`*.local.*` file. Existing `AWS_DISCOVERY.md`, `SECURITY_PLAN.md` and `artifacts/` are local-only and explicitly ignored. Read them locally when relevant; do not copy their values into public files.
- Keep public source code, generic architecture, security controls and synthetic tests reviewable. General security design is not a secret; authorization must remain effective when the source is public.
- Commit only placeholder-only configuration examples. Never add real credentials to an example file. Frontend environment values, especially `VITE_*`, are public after building: no credentials or private operational values there, even if the source `.env` is ignored.
- Deployment account IDs/profile names and environment-specific resource values come from ignored local configuration or protected CI configuration. Validate the expected account before deploying, without embedding an owner's account ID in source.
- Use scoped temporary AWS credentials locally and scoped OIDC federation for future CI. Do not place long-lived AWS keys in the repository or frontend.
- Do not use `git add -f` for ignored files. Do not weaken ignore rules or secret-scanner exclusions merely to make a check pass.
- Before the first public push, inspect the files actually staged and all history to be published, scan for secrets, review asset redistribution rights, and configure available repository secret scanning/push protection. `.gitignore` does not remove files already tracked or erase Git history. If a real credential was exposed, revoke/rotate it before treating cleanup as complete.
- Do not create/push a remote or change cloud resources solely because these instructions mention future publication. Follow the user's authorized task scope.
