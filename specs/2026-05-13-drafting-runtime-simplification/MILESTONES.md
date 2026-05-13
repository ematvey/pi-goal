# Milestones: Simplify goal drafting while hardening runtime execution and audit

Free-form implementation log. Record meaningful phase changes, successful milestones, failed attempts, setbacks, fixes, validation notes, and decisions. Use third-level headings with timestamps down to seconds, for example `### 2026-05-13 14:16:36 - Short milestone title`. No strict schema is required.

### 2026-05-13 00:00:00 - Spec established

Created the initial PRODUCT.md and TECH.md for simplifying `/goal-set` and `/goal-sisyphus` drafting while preserving strict active-goal execution and independent completion audit behavior. Research found that drafting validators were already softened in `extensions/goal-draft.ts`, but `extensions/goal.ts` still carried heavier session state through `draftingFor`, `draftId`, `questionsAsked`, `draftingNudgesByDraftId`, hidden prompt reinjection, and drafting-specific turn hooks.

### 2026-05-13 16:54:11 - Milestone

Implemented the lightweight goal confirmation refactor. `extensions/goal.ts` now uses a thin `confirmationIntent` instead of `draftId`/`questionsAsked` drafting state, starts `/goal-set` and `/goal-sisyphus` through a normal confirmation prompt, removes drafting nudges and prompt reinjection, and keeps strict execution/audit gates intact. `extensions/goal-draft.ts` now validates against confirmation intent, ignores deprecated `draftId` for compatibility, and emits shorter lightweight confirmation guidance. Updated README, architecture/design docs, PRODUCT/TECH decisions, and goal-draft tests. Validation passed: `npm run check`, `npm test`, `npm pack --dry-run`, and `git diff --check`.
