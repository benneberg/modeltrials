# Model Trials

Local-first PWA for structured competitions between AI models. No backend: data and encrypted keys live in this browser's IndexedDB.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: vault, import/export, visibility enforcement
npm run build      # outputs dist/
```

## Deploy to GitHub Pages
1. Push this project to a GitHub repo whose default branch is `main`.
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab). `.github/workflows/deploy.yml` installs, typechecks, runs the tests, builds, and publishes `dist/`.

The build uses relative paths (`base: './'`), so it works from `user.github.io/repo/`. The service worker caches the app shell after the first visit, so it opens offline. If a test fails, nothing is deployed.

## Key vault
- API keys are encrypted with AES-GCM; the key is derived from your passphrase with PBKDF2-SHA256 (310,000 iterations, random salt, fresh IV per key).
- The passphrase is held in memory only, never stored or exported, and the vault auto-locks after 15 minutes idle.
- Forget the passphrase and you re-enter your API keys; there is no recovery.
- Keys saved by the earlier version still work and are marked LEGACY; re-save them to upgrade.

## Ranking
Rubric score first. Real-money trials use equity when a rubric score is missing, and as the first tie-break. Remaining ties go to lower cost, then name. The leaderboard says which rule separated two tied participants.

## Behaviour worth knowing
- Replies stream in as they are written (OpenAI-compatible, Anthropic and Gemini). Gemini keys are sent in a header, not the URL.
- **Compare two** in the Arena shows two participants turn by turn, with score, tokens and cost.
- Provider calls retry up to twice on 429 and 5xx (honouring Retry-After), with a 60s timeout per attempt.
- If a real key is linked and the call fails (CORS, timeout, bad key), the app records a **failed call**, not a made-up answer. Run the prompt in the provider's app and paste the reply as a manual entry.
- With no key linked, replies come from a clearly labelled **sandbox** that is simulated text, not a model.
- Exports never contain keys or key links. Imports are validated: schema version, 2-5 participants, criteria weights summing to 100.
