# Manual GitHub Actions releases — Carehold

These workflows let an operator start a release from the GitHub website/mobile browser. They **never** run on a push or pull request and never create a Cloudflare database or modify Worker secrets.

## One-time GitHub and Cloudflare setup (do this before running)

1. Merge the reviewed workflow PR into `main`. GitHub's Actions tab lists `workflow_dispatch` workflows once their files exist on the default branch.
2. In GitHub repository **Settings → Environments**, create separate `staging` and `production` environments. Restrict production deployments to `main`, configure **required reviewers** and enable **prevent self-review** if available. The repo workflow cannot configure or verify those GitHub environment protections for you. Configure staging approvals too if feature branches are not fully trusted.
3. Add **environment secrets** to **each** environment, with distinct environment-specific values: `CLOUDFLARE_API_TOKEN` (a Cloudflare API token scoped to the intended account with Worker deployment and D1 read/write permissions), `CLOUDFLARE_ACCOUNT_ID`, and `D1_BACKUP_PASSPHRASE` (at least 24 characters, saved in a password manager). Never commit these values. The production and staging database encryption passphrases should differ.
4. Confirm the target IDs and URLs in `wrangler.jsonc` match your Cloudflare Worker and D1 targets. Worker runtime secrets (Better Auth, pilot code, VAPID) stay in Cloudflare for the matching environment; they are **not** GitHub Actions secrets.
5. Complete the production go/no-go checklist in `docs/CLOUDFLARE_PRODUCTION.md`. These workflows do not replace its required real-world testing, security/privacy review and owner approval.

## Launch from a phone

Open **RyanBeevers/carehold → Actions** (mobile browser; use desktop-site view if the Run workflow control is hidden). Choose **Carehold - Deploy staging (manual)** or **Carehold - Deploy production (manual)**.

- **Staging:** choose the branch containing the code you intend to test; type `DEPLOY STAGING`. The selected branch's latest commit is checked and released. Only trusted code should ever be run, because deploy jobs use staging credentials.
- **Production:** select **main** only; type `DEPLOY CAREHOLD PRODUCTION`, `E2E REVIEWED` and `SECURITY REVIEWED` only if each statement is true. Production deploy checks that `main` has not moved since the run started, and the `production` GitHub environment should require a separate reviewer approval before secrets can be used.

The workflow runs TypeScript, Node, Python and Vite checks before the deploy job. It exports D1 first, encrypts the SQL with a separate passphrase, uploads the **encrypted-only** artifact to that workflow run, and fails before migrations if the artifact upload fails. Download and securely retain any backup needed beyond GitHub's **7-day** artifact retention; never upload a plaintext D1 export. Use:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in carehold-ENV-*.sql.enc -out carehold-restored.sql -pass env:D1_BACKUP_PASSPHRASE
```

Store the decrypted SQL securely and delete it after recovery. A D1 migration is not undone by redeploying an older Worker. A failed smoke check, deployment or migration requires investigation and possibly a supervised database restore.

The manual Mac scripts `npm run release:staging` and `npm run release:production` remain interactive and unchanged; the GitHub-specific scripts preserve equivalent release gates without pretending an unattended runner is an interactive operator.
