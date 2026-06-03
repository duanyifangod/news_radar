# CLAUDE.md

This file is read by Claude Code (and other Anthropic agents) when operating in this repository.

The full agent contract — project purpose, deployment modes, directory layout, data schema, CI rules, editing rules, release process — lives in **[AGENTS.md](./AGENTS.md)**.

Always read `AGENTS.md` first. Treat its rules as authoritative.

## Quick Reference for Agents

- Entry points: scripts under `src/cli/`, exposed via `pnpm` scripts in `package.json`.
- Daily generation: `pnpm daily` (writes `digests/<today>/` and updates `manifest.json` + `feed.xml`).
- Local serving: `pnpm serve` on `0.0.0.0:3000` (LAN). Public site: <https://duanyifangod.github.io/news_radar/>.
- Frontend reads JSON via paths **relative to `document.baseURI`** so it works at LAN root and at the `/news_radar/` Pages subpath. Do not reintroduce absolute `/manifest.json` style paths.
- CI: `.github/workflows/daily.yml` runs `pnpm daily` at 01:00 UTC and pushes back to `main`. Pages auto-republishes.
- Required quality gates after non-trivial changes: `pnpm typecheck`, `pnpm test`, `pnpm lint`.

## Things Agents Must Not Do Without Explicit Approval

- Add new GitHub workflows or remove the existing `daily.yml`.
- Disable GitHub Pages or change the Pages source branch/folder.
- Delete `.nojekyll`.
- Commit `.env` or any file containing API keys.
- Run `git add -A` (use targeted paths; `digests/` contains generated files).
- Reintroduce removed legacy modules: GitHub Issues digest, Telegram/Feishu bots, social posting, finance/AI-tool/weekly/monthly reports.
- Force-push or rewrite history on `main`.

## When in Doubt

- Behavior unclear → re-read `AGENTS.md`.
- Schema unclear → inspect a recent `digests/<date>/news-data.json` and the producing code under `src/cli/news-index.ts`.
- Test before pushing structural changes.
