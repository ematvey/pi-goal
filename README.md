# pi-goal

`pi-goal` is a long-running goal extension for [pi](https://github.com/earendil-works/pi-coding-agent). It gives the agent a durable objective, a visible lifecycle, and schema-gated tools for drafting, executing, pausing, resuming, and completing work.

The extension is designed around one rule: **the user owns intent; the agent executes only after the goal is explicit and confirmed**.

## What it provides

- **Two goal styles**: regular goals for open-ended work, and Sisyphus goals for patient ordered execution.
- **Draft-before-run flow**: `/goal-set` and `/goal-sisyphus` start a drafting conversation before any work begins.
- **Confirm-before-commit**: the agent must call `propose_goal_draft`; the user confirms or keeps chatting.
- **Full goal visibility**: after confirmation, the final objective is printed back into the conversation in full.
- **Multiple open goals**: `.pi/goals/` may hold several active goal files at once; each pi session focuses exactly one goal at a time.
- **Session-local focus**: the focused goal id is stored as a branch-local session entry, not in goal markdown metadata.
- **Auto-continue loop**: confirmed goals can continue across turns until completion, pause, abort, user interruption, or the empty-turn guard.
- **Schema gates**: unsafe lifecycle transitions are rejected by tool validators, not just prompts.
- **Sisyphus as a light variant**: Sisyphus shares the normal lifecycle/tools and differs only in prompt style and completion standard.
- **Pause/resume/abort/clear lifecycle**: goals can be paused by the user, paused by the agent when blocked, resumed, completed from pause, aborted, or archived.
- **Disk-backed state**: active and archived goals are stored under `.pi/goals/`.
- **Lightweight built-in questionnaire tools**: `goal_question` and `goal_questionnaire` let the agent ask structured drafting questions without depending on another package.
- **Above-editor status widget**: pi shows the current goal, status, progress, and active file path while work is running.

## Install

From npm:

```bash
pi install npm:@capyup/pi-goal
```

From a local checkout:

```bash
pi install .
```

Try once without installing:

```bash
pi -e .
```

## Quick start

### Regular goal

```text
/goal-set add structured logging to the auth module
```

Flow:

1. The agent asks at least one concrete question about success criteria, constraints, boundaries, priorities, or blocker handling.
2. The agent calls `propose_goal_draft` with a concrete objective after incorporating the answer.
3. pi shows a full plain-text confirmation report.
4. If confirmed, the full finalized goal is printed into the conversation and written to `.pi/goals/`.
5. The new goal becomes this session's focus. Existing open goals remain in `.pi/goals/` and can be selected later with `/goal-focus`.
6. The agent works only on the focused goal until it calls `update_goal(status="complete")`, pauses, aborts, produces an empty/non-progress turn, or the user interrupts.

### Sisyphus goal

```text
/goal-sisyphus Refactor the auth flow: 1) extract token validation. 2) wire it into login. 3) update tests.
```

Sisyphus mode is for patient ordered execution. It uses the same lifecycle and tools as a regular goal; the difference is the prompt style and completion standard: preserve the user's order, do not rush, do not invent preflight/reconnaissance steps, and stop to ask when blocked.

## User commands

```text
/goal-set <topic>       Start drafting a regular goal
/goal-sisyphus <topic>  Start drafting a Sisyphus-style goal
/goal-status            Show focused goal state
/goal-list              List all open goals in .pi/goals/
/goal-focus             Choose this session's focused goal
/goal-tweak <change>    Draft a revision to the focused active/paused goal
/goal-pause             Pause the focused active goal
/goal-resume            Resume a paused goal
/goal-settings          Configure pi-goal settings, including auditor model settings
/goal-abort             Abort/archive the focused goal or cancel drafting
/goal-clear             Archive the focused goal or cancel drafting
```

Pressing `Esc` or aborting an active run pauses the goal so it does not remain falsely active.

## Multiple open goals and focus

`pi-goal` separates durable goals from session focus:

- **Goal pool**: every open goal is an `active_goal_*.md` file under `.pi/goals/`.
- **Focused goal**: the current pi session has one focused goal id stored in a `pi-goal-focus` custom session entry.
- **No focus in markdown**: goal files describe the goal itself; they do not record which session is focused on them.
- **Branch-local focus**: because focus is reconstructed from the current session branch, `/tree` navigation can restore a different focus for a different branch.
- **One continuation chain**: auto-continue only schedules work for the focused goal in the current session.

Creating a goal with `/goal-set` or `/goal-sisyphus` no longer clears other open goals. It creates a new active goal file and focuses it. Use `/goal-list` to inspect open goals and `/goal-focus` to switch the session focus. If the latest focus entry explicitly clears focus, or points at a missing/stale goal, a remaining single open goal is not auto-focused; single-open auto-focus only happens when no focus entry exists at all. If multiple open goals exist and the session has no valid focus, `/goal-resume`, `/goal-clear`, `/goal-abort`, `/goal-pause`, and `/goal-tweak` ask the user to choose a goal instead of acting on all of them.

## Agent tools

The extension exposes tools only when they make sense for the current lifecycle phase.

| Tool | Visible when | Purpose |
|---|---|---|
| `goal_question` | drafting / tweak drafting | Ask one focused user question |
| `goal_questionnaire` | drafting / tweak drafting | Ask multiple structured questions |
| `get_goal` | always | Read the focused goal state; mentions other open goals when present |
| `propose_goal_draft` | registered; accepted only during goal drafting | Submit a concrete draft for user confirmation |
| `apply_goal_tweak` | tweak drafting only | Submit a revision to an existing goal |
| `update_goal` | focused active or paused goal | Mark the focused goal complete when all requirements are satisfied |
| `pause_goal` | focused active goal | Pause the focused goal because of a real blocker |
| `abort_goal` | focused active or paused goal | Abort/archive an obsolete, impossible, unsafe, or user-cancelled focused goal |
| `step_complete` | hidden / legacy | Compatibility no-op; Sisyphus no longer requires a step counter |
| `create_goal` | hidden | Direct calls are rejected; normal creation goes through `propose_goal_draft` |

## Drafting behavior

`/goal-set` and `/goal-sisyphus` start a lightweight confirmation conversation, not a heavy runtime sub-state. The agent clarifies only when needed, may proceed directly for fully specified requests, and then calls `propose_goal_draft` to show the user a Confirm / Continue Chatting dialog. `goal_question` and `goal_questionnaire` are available when structured input helps, but plain conversation is acceptable.

The agent may do minimal read-only reconnaissance when it directly improves the goal contract, but should not begin substantive implementation before confirmation. The strict runtime starts after the user confirms the draft and an active goal is created.

When a draft is proposed, the confirmation UI shows a full plain-text report with draft details, the original topic, and the proposed goal. If the confirmation UI throws in interactive mode, creation fails closed and confirmation remains active; it never auto-creates a goal. When a draft is confirmed, the tool result includes the full final objective, not a one-line summary, and normal work tools (`write`, `read`, `bash`, `edit`) are available for execution. This makes the confirmed contract visible in the conversation as well as on disk.

While goal confirmation or tweak drafting is active, old goal execution is suspended: active-goal prompts, accounting, and auto-continue checkpoints do not run for the previously focused goal.

## Completion behavior

Completion is also explicit and is checked by an independent pi auditor agent. The executor calls `update_goal` with its completion claim:

```json
{
  "status": "complete",
  "completionSummary": "What was completed and what evidence proves it."
}
```

Before archiving the goal, `update_goal` starts a separate pi agent in an isolated in-memory session. The auditor receives the objective, the executor's completion claim, and current goal metadata, then can inspect the workspace with read-only-oriented tools (`read`, `grep`, `find`, `ls`, and `bash`). It must end its report with exactly one marker:

- `<approved/>` archives the goal as complete.
- `<disapproved/>`, no marker, an error, or an abort rejects completion and leaves the goal open.

The auditor is semantic, not a paperwork checklist: it should reject scaffold-only, alpha, generated-template, proxy-metric, build-only, or weakly verified completions when the real user outcome is not satisfied.

By default the auditor uses the current/default pi model. Configure it interactively with `/goal-settings` -> `auditor`, then click `provider`, `model`, or `thinking_level` and type the value directly. The settings are saved to `.pi/goal-auditor.json`. You can also edit the file or override it with environment variables:

```json
{
  "provider": "fireworks",
  "model": "accounts/fireworks/routers/kimi-k2p6-turbo",
  "thinking_level": "high"
}
```

Environment variables `PI_GOAL_AUDITOR_PROVIDER`, `PI_GOAL_AUDITOR_MODEL`, and `PI_GOAL_AUDITOR_THINKING_LEVEL` take precedence over `/goal-settings`.

The completion result prints a full report into the conversation:

- `Goal complete.`
- optional completion summary / evidence supplied by the executor
- the auditor's approval report
- full current goal details, including objective, status, usage, mode, and file path

Sisyphus goals use the same completion tool as regular goals. The stricter part is the prompt/criteria standard: the agent should only call completion after the whole ordered objective is actually satisfied and likely to survive independent auditing. A paused goal can also be completed directly when the agent already has enough evidence that every requirement is satisfied; it does not need a resume just to call `update_goal`.

## Schema gates

The shipped gates are intentionally small and mechanical.

| Gate | Prevents |
|---|---|
| Focus consistency | `/goal-set` accidentally becoming Sisyphus, or `/goal-sisyphus` becoming regular mode |
| Confirm-before-commit | The agent silently creating or replacing a goal |
| Draft identity gate | A stale overlapping draft prompt creating or focusing a goal after a newer draft starts |
| Completion auditor gate | Archiving completion unless an independent pi auditor agent returns `<approved/>` |
| Abort gate | Aborting missing, stale, completed, or reasonless goals |
| Direct-create rejection | Hidden `create_goal` calls creating goals without the confirmation flow |
| Post-stop block | Continuing to call tools after `pause_goal`, `abort_goal`, `update_goal`, or `apply_goal_tweak` stops the turn |
| Empty-turn guard | Pure chat loops that would keep auto-continuing without meaningful goal work |
| Abort pause | Active goals staying active after user abort / Ctrl-C |
| Disk reconciliation | External pause/archive/delete/status changes being ignored or overwritten by stale memory |
| Post-compaction reminder | Losing the active objective after session compaction |

## Files

```text
.pi/goals/active_goal_<timestamp>_<id>.md
.pi/goals/archived/goal_<timestamp>_<id>.md
```

Multiple `active_goal_*.md` files may exist simultaneously. This is the project-level open goal pool. The selected/focused goal is intentionally not stored in these files; focus lives in session custom state.

Each file contains:

1. extension-owned JSON metadata;
2. a user-editable `# Goal Prompt` section;
3. progress/status information.

Before commands, tools, and lifecycle hooks act on a focused goal, the runtime reconciles the focused record against the active goal file on disk. External archive/delete/status changes therefore win over stale in-memory state and cannot resurrect deleted active files. Prompt-body edits are still picked up from the `# Goal Prompt` section; focus is never stored in goal markdown.

Goal paths are constrained to `.pi/goals/` and `.pi/goals/archived/`; absolute paths, traversal, NUL bytes, symlinks, and unsafe metadata paths are rejected.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `PI_GOAL_AUTO_CONFIRM` | unset | When `1`, auto-confirms drafts in headless/test contexts |

## Development

```bash
npm install
npm test
npm run check
npm pack --dry-run
```

The fast unit suite uses Node's built-in test runner and covers core parsing, drafting gates, lifecycle policy, abort policy, questionnaire formatting, centralized tool names, Sisyphus prompt-style behavior, completion reporting, and display helpers.

The experiment harness under `experiments/` runs full pi sessions against real model calls and mechanical rubrics.

```bash
cd experiments
bash harness/run.sh C1-vague-goal-set --count 3 --grade --no-smoke
```

## Package contents

The npm package ships only the runtime extension, docs, and package metadata. The extension is split into small modules:

```text
extensions/goal.ts                 orchestration, commands, tools, events, timers
extensions/goal-record.ts          goal record types, normalization, creation helpers
extensions/goal-pool.ts            open-goal pool, focus resolution, list/selector text helpers
extensions/goal-core.ts            display helpers
extensions/goal-draft.ts           lightweight confirmation prompt, proposal validation, drafting tool gate
extensions/goal-policy.ts          lifecycle, pause/resume/complete, and Sisyphus policy
extensions/goal-auditor.ts         independent pi auditor agent for completion approval
extensions/goal-questionnaire.ts   built-in question UI and question tool registration
extensions/goal-tool-names.ts      centralized published tool names and allowlists
extensions/prompts/goal-prompts.ts active, continuation, tweak, and stale prompts
extensions/storage/goal-files.ts   goal file paths, serialization, parsing, archive IO
extensions/widgets/goal-widget.ts  above-editor goal beacon component
extensions/widgets/goal-notifications.ts widget-style notification text
```

## Design principles

- **User owns intent**: only the user starts, replaces, resumes, clears, or confirms goals; the agent may only pause, complete, or abort through schema-gated lifecycle tools with evidence/reason.
- **One commit path**: normal goal creation goes through drafting and confirmation.
- **Schema beats prompt walls**: recurring failure modes are handled by validators and tool-call interceptors.
- **Visible contracts**: confirmed goals and completion reports are printed fully into the conversation.
- **Lifecycle-shaped tool surface**: the agent sees only tools appropriate to the current phase.
- **Disk-backed continuity**: goal state survives context churn and can be audited from `.pi/goals/`.
- **Human-owned focus**: the agent may work on the focused goal, but only user commands/UI selection switch focus.

## Release policy

This repository can be validated locally with tests and packaging checks. Publishing a new npm version, pushing tags, and running `pi update` are explicit release steps and are not part of ordinary implementation goals unless requested.

## License

MIT
