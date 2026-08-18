# Changelog

All notable changes to the Pyrus Bots project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- `bootstrap.ps1` — brings a clean machine up: checks Node.js (offering to install it), installs dependencies, creates `.env` from the example, runs the build check and reconciles with the knowledge base. Written in PowerShell rather than TypeScript because it has to run where Node.js does not exist yet. It never overwrites an existing `.env`, and it never asks for or fills in credentials — each engineer's Pyrus key is their own, which is what makes authorship visible in the knowledge base.
- Three agent roles: `pyrus_tech_writer` (user-facing documentation in plain language — a different skill from writing a spec), `pyrus_doc_reviewer` (the checks a linter cannot make: contradictions, guesses stated as fact, drift from the code) and `pyrus_bank_curator` (what earns a place in the function bank and on what terms). A "connection cartographer" role was deliberately **not** created: the map is derived by a script and its freshness is enforced by `npm run check`, and a role that hand-maintains a derived artefact is guaranteed to fall behind.
- Agent roles are now mirrored into the knowledge base. Fundamental rule 5 has always required it; `.agents/agents/` was simply never wired into the generator.
- `reference/` — vendor samples and pre-repository dumps moved out of the repo root, with a README explaining that they are not documentation and that the legacy bots still need filing under their clients.
- `npm run map` — a per-client connection map derived from the code and the document frontmatter, not maintained by hand: which script touches which field of which form, plus the catalogs involved. `npm run map:check` runs inside `npm run check` and fails when the map has fallen behind the code. Name-based linking (Obsidian style) was rejected: "Заказы тортов" is simultaneously a form, a folder, a KB section and an article title, so linking by name yields a dense graph that answers nothing, while code references a field unambiguously.
- The map flags fields a script uses that the field specification does not declare — either the spec has drifted or the code has a typo, and both are worth knowing.
- `templates/form/` plus `npm run new:form` — the canonical article set for a form (6 user-facing, 12 technical, plus the form's own index and scripts section), deployed by a scaffolder that also writes the parent index entry and the client changelog line, so Fundamental rules 1 and 2 stop depending on anyone remembering them.
- Catalog documentation in both audiences, previously missing entirely: what a catalog contains and what breaks when a row changes (technical), and how to add, amend and retire a value without severing history in existing tasks (user-facing).
- `src/lib/` — the function bank now holds code, not just prose. `FormModel`, `TaskModel`, value parsing, visibility evaluation, answer parsers, `same_value`, `copy_by_value`, `get_values_for_catalog` and a caching `ExtendedClient`, covered by 70 local checks.
- A machine-checked constraint that the bank imports nothing beyond `pyrus-api`, the Node stdlib and its own modules — Pyrus server scripts cannot resolve npm packages, so a stray import would only fail at deploy time.

### Fixed
- Three defects carried over from the Pyrus template bots, found while porting them into the bank: `same_value` fell through from `case 'file'` into the table branch (any two attachment sets of equal length compared as identical, so a replaced file was never written); `same_value` assigned `'unchecked'` into the caller's field, so comparing mutated the task; `get_values_for_catalog` matched catalog rows by substring, so searching for "1" also matched "10" and "21".

### Changed
- `pyrus_simulator.ts` moved from the repo root to `src/lib/testing/pyrus_simulator.ts`, the location its own README had been declaring all along.
- The simulator now replaces global `fetch` for the duration of `simulateServerBot`. Tests no longer reach the live `api.pyrus.com` (the order_bot test took 7261 ms and failed authorisation with `401`; it now runs in 30 ms). Unstubbed calls are recorded in `network.unmatched` instead of silently looking like an outage.
- `test_runner.ts` gained assertions and a non-zero exit code on failure. It previously logged errors and exited successfully, so `npm run check` passed on a broken bot.

### Added
- Created `pyrus_orchestrator` agent for initial user routing and project setup.
- Created `pyrus_spec_analyst` agent for strict requirements (ТЗ) validation and edge-case discovery.
- Added strict documentation templates in `docs/TEMPLATE/` (`specification.md`, `technical.md`, `user.md`).
- Designed architecture for `src/lib/` (Банк функций) to act as a unified utility constructor for future bots.

## [1.0.0] - 2026-08-07
### Added
- Local simulator `pyrus_simulator.ts` for automated testing of Server Script Bots and Client Form Scripts without deploying to Pyrus.
- Local test runner `test_runner.ts` using `ts-node`.
- Mandatory recursive Form & Task Tree parsing rules (`FormModel` and `TaskModel`) standardized across all bots and guidelines.
- Extensive technical guides for Server Bots (`PYRUS_SERVER_BOTS_GUIDE.md`) and Form Scripts (`PYRUS_FORM_SCRIPTS_GUIDE.md`).
- Agent prompts and skills for `pyrus_bot_developer` and `pyrus_form_script_developer`.
