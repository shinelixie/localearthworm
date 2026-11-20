# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Earthworm 本地版 — a fork of [cuixueshe/earthworm](https://github.com/cuixueshe/earthworm) reworked into a single-machine English-learning tool: no account, no Docker, no network dependency at runtime. pnpm workspace (`packages: apps/*, packages/*`), requires Node ≥ 20, pnpm ≥ 8.

- `apps/api` — NestJS backend, port **3101**
- `apps/client` — Nuxt 3 SPA (`ssr: false`), port **3100**
- `packages/schema` — drizzle table definitions (the only source of DB shape), built with tsup
- `packages/db` — drizzle connection + migrations
- `packages/xingrong-courses` — corpus: built-in 55-lesson NCE data, CSV importer, course seed/append/reset scripts
- `packages/game-data-sdk` — shared game-data library
- `packages/docs` — VitePress docs
- `tools/tts-worker/worker.py` — Python `edge-tts` worker spawned by the API (needs `pip install edge-tts`)

## Setup & build

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/client/.env.example apps/client/.env
pnpm schema:build          # build packages/schema → dist/ (API and scripts import its dist)
pnpm -F api build          # → apps/api/dist
pnpm -F client build       # → apps/client/.output (Nitro production bundle)
```

- `apps/api/.env` is the single env source: `packages/db/src/db.ts` and `drizzle.config.ts` both load `apps/api/.env` (or `.env.prod` when `NODE_ENV=prod`) via dotenv. Defaults assume Postgres `127.0.0.1:5434` and Redis `127.0.0.1:6381`.
- **Port scheme**: this repo intentionally uses 5434/6381 (DB/Redis), 5481/6382 (test DB/Redis), 3101 (API), 3100 (web) — shifted one slot from upstream, because upstream `cuixueshe/earthworm` may run on the same machine with 5433/6379/5480/6380/3000/3010. The two projects' databases are NOT interchangeable, so keep them on separate DBs.
- Empty database needs: `pnpm db:init` (drizzle-kit push) then `pnpm db:upload` (import built-in corpus).
- Runtime data is NOT in git: `tools/pgsql`, `tools/redis` (portable binaries), `tools/pgdata` (DB data dir), `storage/tts` (audio cache).

### Running locally (production mode, what start-earthworm.bat does)

`start-earthworm.bat` / `stop-earthworm.bat` (Windows) and `start-earthworm.sh` / `stop-earthworm.sh` (Linux/macOS, DB/Redis via docker-compose) each start 4 background services: Postgres (5434), Redis (6381), API via `node --env-file=.env dist/src/main` (3101), client via `server-start.mjs` (which pins PORT/NITRO_PORT=3100 then imports `.output/server/index.mjs`). The stop scripts kill the recorded process **group** (`.earthworm-*.pid`), because the API parent owns the TTS Python worker — killing only the shell orphans node.

### Running in dev

```bash
pnpm dev:serve     # schema:build + nest start --watch (API)
pnpm dev:client     # nuxt dev (client, 3100)
```

## Testing

- `pnpm test` = API unit + API e2e + client vitest. Single runs: `pnpm -F api test:unit` (mocked, no DB), `pnpm -F api test:e2e` (needs `apps/api/.env.test` — copy from `.env.test.example` — plus a real Postgres+Redis it points at), `pnpm -F client test` (vitest run). Pattern filter: `pnpm -F api test:unit -- <pattern>`.
- API unit specs are `*.spec.ts` (jest, rootDir `src`), e2e are `*.e2e-spec.ts`. Shared e2e helpers in `apps/api/test/helper` (DB truncate per test, ioredis-mock, token via `LogtoService.fetchToken`).
- Client e2e is Cypress (`pnpm -F client cypress:open`), not wired into `pnpm test`.
- CI (`.github/workflows/ci.yaml`) is **manual dispatch only** — upstream auto-triggers are commented out. It runs `pnpm db:init:test:ci` then `pnpm test:ci` against its own self-hosted Postgres 5480 + Redis (CI-only ports, different from the local 5481/6382 test scheme).

## Core architecture

### Local auth (replaces Logto)

`apps/api/src/guards/auth.guard.ts`: with `LOCAL_MODE=true` (default) a request carrying `Authorization: Bearer earthworm-local-token` is accepted without JWKS verification and `request.userId` is set to `LOCAL_USER_ID` (`local-user`). The client has the same fixed token built in and sends it via `apps/client/api/http.ts` + `plugins/logto.ts`. Flipping `LOCAL_MODE=false` restores the full Logto JWKS path (kept intact). Public endpoints use the `@UncheckAuth()` decorator. **Offline batch scripts also call the running API with this token** (`LOCAL_TOKEN` env, default `earthworm-local-token`).

### TTS

`apps/api/src/tts/`: Microsoft Edge neural TTS via a resident Python `worker.py` (edge-tts). Audio is cached in **two places**: disk under `storage/tts/<2 chars>/<hash>.mp3` keyed by `hash(voice|rate|text)`, and the `tts_audio` table (mp3 as `bytea`, unique per text+voice+rate) — on a disk miss the API reads the DB and rewrites the disk file, so clearing `storage/` or changing machines needs no re-synthesis. Endpoints: `POST /tts/prewarm`, `GET /tts/prewarm/status`, `POST /tts/cache/purge`. Auto-prewarm runs 15s after boot (`TTS_AUTO_PREWARM=true`). **Changing `TTS_VOICE` or `TTS_RATE` changes the cache key — the whole library must be re-synthesized.** `TTS_ENABLED=false` degrades gracefully to browser `speechSynthesis`.

### Database layer

Table definitions live in `packages/schema/src/schema/*.ts` (coursePack, course, statement, userCourseProgress, masteredElements, …). Change flow: edit schema → `pnpm schema:build` → `pnpm db:init` (`drizzle-kit push`) → rebuild the API (it imports the built `@earthworm/schema` dist). Migrations are also committed under `packages/db/drizzle/`. API access goes through the global `DB` provider (`apps/api/src/global/providers/db.provider.ts`, drizzle over postgres-js) — no per-module DB setup. The learning-progress table is unique per **lesson** (`user_id, course_pack_id, course_id`), not per pack — the course list progress bars depend on that granularity.

Key tables added by migrations 0010–0012 (all in `packages/schema/src/schema/`):

- `statements.analysis` (jsonb `StatementAnalysis`) — per-word grammar-role annotation (role/roleEn/explanation + words with phonetic/pos/meaning) and a `glossary` used to build fragment Chinese hints. Usually null.
- `statements.split_tree` (jsonb `SplitTree`) — LLM-generated nested tree; tokens separate word from punctuation, node `range` is a closed token-index interval, leaves are single words, each node carries `en`/`zh`. Usually null.
- `fragment_translation` — persistent translation cache for runtime-generated fragments (unique per source text + lang pair).
- `tts_audio` — DB copy of the TTS disk cache (see TTS).
- Learning path: `learning_path_config` (per pack: open modes/difficulties/stars/daily limits/node order; no row = server-side default), `user_course_mode_progress` (per user × course × mode × difficulty: bestRank S–D, stars 0–3, completionCount), `user_daily_mode_activity` (daily per-mode counters for limits).
- Review: `review_card` (FSRS-scheduled cards) and `review_setting`.
- Practice: `practice_state` (resume position for split practice: statementIndex + generation params, unique per mode × splitMode × stagesKey), `last_practice` (home-page “继续游戏”, one row per course), `practice_route_progress` (splitMode × difficulty completion), `practice_session` (per-session stats + rank).

### Course pipeline

- Built-in corpus: `pnpm db:upload` (seed), `pnpm -F @earthworm/xingrong-courses course:add` (append a lesson to an existing pack), `course:reset` (reset statements).
- User CSV import: `pnpm db:import --file x.csv [--dry-run]`; the web import (`course-pack-import.service.ts`) posts CSV text in a JSON body — API JSON body limit is raised to 10mb in `main.ts`.
- CSV format, cover upload, and batch-append semantics are documented in `课程包导入说明.md`.
- CET4/CET6 packs were restructured to **one sentence per lesson** (`tools/split-cet-courses.mjs`, re-runnable, migrates old `course_id` references in practice/review tables). Consequence: “recent course packs” queries must over-fetch — `getUserRecentCoursePacks` now derives “recent” primarily from `last_practice` (covers every practice type), with `user_course_progress` as fallback, and de-dups by pack keeping the latest row.
- Course reset (`user-course-progress.service.ts` `resetCourse`) must delete `user_course_progress` **and** `courseHistory` (otherwise the progress bar sticks at 100% once learnedCount > 0) plus learning-path stars and review cards.
- `tools/migrate-from-upstream.sql` — one-off dblink migration of ielts/toefl/kaoyan packs from the upstream DB, preserving ids.

### Statement enrichment (offline LLM batch)

`statements.analysis` and `statements.split_tree` are generated offline by batch scripts against the **local vLLM** (`TRANSLATE_LLM_URL` default `http://127.0.0.1:7000/v1`, model `qwen3.8-27b`) and written back through API endpoints authenticated with the fixed local token — the API needs to be running:

- `node tools/generate-split-trees.mjs [--pack … --limit … --force --concurrency 6 --ids …]` — LLM emits nested tree JSON only; local code rebuilds tokens, recomputes ranges/levels, validates (contiguous, no overlap, no dropped words), retries ≤ 3, then `POST /split-tree/:statementId`. Failures land in `tools/.split-tree-failures.json` (gitignored, regenerated each run).
- `node tools/generate-grammar-analysis.mjs` — per-word role annotation, same pattern (`POST /grammar-analysis/:statementId`), failures in `tools/.grammar-analysis-failures.json`.
- `fix-cet-grammar.mjs` / `fix-failed-grammar.mjs` — targeted re-runs of the grammar batch.

Both scripts already-generated-by-default skip; use `--force` to redo.

### Split practice (拆分练习)

Practice questions for the split modes are **generated client-side** from `split_tree` × practice mode (`chinese_to_english` / `dictation` / `listening`) × split mode (`word_first` / `chunk_first` / `top_down` / `sentence_only` / `custom`) × stages (`phrase` / `core_chunk` / `combo_chunk` / `full_sentence`) — the server has no question list. `apps/client/composables/main/splitMode.ts` is the shared generation logic (unit-tested). Persistence uses `practice_state` (resume: statementIndex + stagesKey fingerprint, so a changed stage set naturally invalidates it) and `practice_session` (server-side rank via per-difficulty S/A/B thresholds in `practice-session.service.ts`). Fragment Chinese hints come from `POST /translate` (see below).

### Translate

`apps/api/src/translate/`: `POST /translate` (`@UncheckAuth` + `AuthGuard`, max 50 texts) translates runtime-generated fragments. Chain: local LLM (batch 8) → Google keyless endpoint (via `TTS_PROXY`/`TRANSLATE_PROXY`, batch 20) → MyMemory. Results are memoized in-process **and** persisted to `fragment_translation`.

### Review (FSRS)

`apps/api/src/review/`: cards scheduled with `ts-fsrs` (`review.fsrs.ts`, no fuzz); graduating at ≥ 21 days scheduled interval. Grading is derived from behavior signals (attempts, hints, typos, audio plays — `ReviewSignals`), not a manual forget/remember button. Endpoints: enqueue per course, `overview`, per-pack `summary`, per-course stats. `review-setting` holds user settings.

### Client specifics

`nuxt.config.ts` disables `autoImport` and component auto-registration — import components explicitly. Runtime env comes from `runtimeConfig.public.*` (apiBase, backendEndpoint, …) populated from `apps/client/.env` at build time.

Main pages: `/` (recent packs + 继续游戏 via lastPractice), `/course-pack` (list + import + **课程管理** entry), `/manage` (course admin: edit statement original/translation/soundmark, visualize+edit grammar analysis, edit split trees with live preview of all four practice modes — `components/manage/`, `composables/manage/`), `/path/[coursePackId]` (learning path tree: mode × difficulty × stars), `/review` + `/review/[coursePackId]` (review queue), `/growth-analytics`, `/game/[coursePackId]/[id]` (practice). Practice entry dialogs live in `components/mode/` (`ModeSelectDialog`, `SplitSelectDialog`, `PracticeRouteDialog`, `ReviewSettingsModal`) and `components/main/` (`GrammarAnalysis`, `SplitSelectDialog`, `VolumeModal`, `BackgroundTintModal`); listening mode in `components/mode/listening/`.

`apps/client/public/dict/wordinfo.json` (per-word phonetic/meaning) is generated by `tools/build-wordinfo.mjs` from the DB (port 5434) + an external dict CSV at `../.tmp-dict/ecdict.csv`; regenerate after adding packs.

## Conventions

- Git hooks (simple-git-hooks + lint-staged): pre-commit runs `prettier --write` on staged files (Prettier config: printWidth 100, sort-imports plugin — it reorders your imports on save/commit). **Commit-msg hook enforces `type(scope): subject`** (angular conventional, subject ≤ 50 chars) via `scripts/verify-commit.ts` — write messages like `feat(api): …`.
- `pnpm format` / `pnpm format-check` for Prettier over the whole repo.
- Releases: `pnpm release` (interactive script in `scripts/release.ts` that bumps, builds, packages and uploads); `pnpm changelog` for conventional-changelog.
- Repo is Windows-user-first (.bat launchers), but all commands work on any OS.
- `npm` registry is set to npmmirror (`.npmrc`).
- In-app help pages are generated from the root-level `*.md` docs (使用说明.md, 部署说明.md, 课程包导入说明.md) by `pnpm docs:help` (`tools/build-help-docs.mjs`), then require `pnpm -F client build` to take effect.
- User-facing docs are in Chinese; the in-app help mirror at `/help` must stay in sync with those `.md` files.
- `TTS_PROXY` / `TRANSLATE_*` in `.env.example` assume a local proxy at `127.0.0.1:7890`; empty `TRANSLATE_PROXY` falls back to `TTS_PROXY`.
