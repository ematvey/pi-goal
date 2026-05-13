import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import test from "node:test";

import {
  appendGoalEvent,
  goalLedgerPath,
  latestAuditorResultForGoal,
  latestEventsForGoal,
  latestGoalLifecycleEvent,
  readGoalLedger,
  reconstructGoalLedger,
  type GoalLedgerEvent,
  type GoalLedgerContext,
} from "../extensions/goal-ledger.ts";

function tempCtx(): GoalLedgerContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "goal-ledger-test-"));
  return { cwd: dir };
}

function cleanup(ctx: GoalLedgerContext): void {
  try {
    fs.rmSync(ctx.cwd, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test("goalLedgerPath resolves under .pi/goals", () => {
  const ctx = tempCtx();
  assert.ok(goalLedgerPath(ctx).includes(".pi/goals/goal_events.jsonl"));
  cleanup(ctx);
});

test("appendGoalEvent creates ledger and appends event", () => {
  const ctx = tempCtx();
  const event: GoalLedgerEvent = { type: "goal_created", goalId: "g1", objective: "test", sisyphus: false, autoContinue: true, at: new Date().toISOString() };
  appendGoalEvent(ctx, event);

  const result = readGoalLedger(ctx);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, "goal_created");
  assert.equal((result.events[0] as { goalId: string }).goalId, "g1");
  assert.equal(result.malformed, 0);
  cleanup(ctx);
});

test("readGoalLedger tolerates missing file", () => {
  const ctx = tempCtx();
  const result = readGoalLedger(ctx);
  assert.deepEqual(result.events, []);
  assert.equal(result.malformed, 0);
  cleanup(ctx);
});

test("readGoalLedger skips malformed lines and counts them", () => {
  const ctx = tempCtx();
  const ledgerPath = goalLedgerPath(ctx);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, "not json\n{\"type\":\"goal_created\",\"goalId\":\"g2\",\"objective\":\"x\",\"sisyphus\":false,\"autoContinue\":true,\"at\":\"2024-01-01T00:00:00.000Z\"}\n", "utf8");

  const result = readGoalLedger(ctx);
  assert.equal(result.events.length, 1);
  assert.equal(result.malformed, 1);
  cleanup(ctx);
});

test("readGoalLedger skips unknown event types", () => {
  const ctx = tempCtx();
  const ledgerPath = goalLedgerPath(ctx);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, "{\"type\":\"unknown_event\",\"at\":\"2024-01-01T00:00:00.000Z\"}\n", "utf8");

  const result = readGoalLedger(ctx);
  assert.equal(result.events.length, 0);
  assert.equal(result.malformed, 1);
  cleanup(ctx);
});

test("reconstructGoalLedger tracks focus and status", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_focused", goalId: "g1", reason: "created", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "blocked", at: "2024-01-01T00:00:02.000Z" },
    { type: "goal_resumed", goalId: "g1", reason: "user", at: "2024-01-01T00:00:03.000Z" },
  ];

  const state = reconstructGoalLedger(events);
  assert.equal(state.focusedGoalId, "g1");
  assert.equal(state.goals.get("g1")?.latestStatus, "active");
  assert.equal(state.goals.get("g1")?.latestPauseReason, undefined);
  assert.equal(state.terminalGoals.size, 0);
});

test("reconstructGoalLedger marks terminal goals", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_completed", goalId: "g1", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_created", goalId: "g2", objective: "o2", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:02.000Z" },
    { type: "goal_aborted", goalId: "g2", reason: "obsolete", at: "2024-01-01T00:00:03.000Z" },
  ];

  const state = reconstructGoalLedger(events);
  assert.equal(state.terminalGoals.has("g1"), true);
  assert.equal(state.terminalGoals.has("g2"), true);
  assert.equal(state.terminalGoals.get("g1")?.latestStatus, "complete");
  assert.equal(state.terminalGoals.get("g1")?.completedAt, "2024-01-01T00:00:01.000Z");
  assert.equal(state.terminalGoals.get("g2")?.latestStatus, "aborted");
  assert.equal(state.terminalGoals.get("g2")?.abortedAt, "2024-01-01T00:00:03.000Z");
  assert.equal(state.goals.has("g1"), false);
  assert.equal(state.goals.has("g2"), false);
  assert.equal(state.focusedGoalId, null);
});

test("reconstructGoalLedger clears focus when focused goal is terminal", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_focused", goalId: "g1", reason: "created", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_completed", goalId: "g1", at: "2024-01-01T00:00:02.000Z" },
  ];

  const state = reconstructGoalLedger(events);
  assert.equal(state.focusedGoalId, null);
});

test("reconstructGoalLedger captures auditor results", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "completion_requested", goalId: "g1", summary: "done", at: "2024-01-01T00:00:01.000Z" },
    { type: "audit_started", goalId: "g1", provider: "fireworks", model: "kimi", at: "2024-01-01T00:00:02.000Z" },
    { type: "audit_result", goalId: "g1", verdict: "disapproved", report: "missing tests", at: "2024-01-01T00:00:03.000Z" },
  ];

  const state = reconstructGoalLedger(events);
  const g1 = state.goals.get("g1");
  assert.ok(g1);
  assert.equal(g1?.latestAuditorResult?.verdict, "disapproved");
  assert.equal(g1?.latestAuditorResult?.report, "missing tests");
});

test("latestAuditorResultForGoal returns most recent result", () => {
  const events: GoalLedgerEvent[] = [
    { type: "audit_result", goalId: "g1", verdict: "disapproved", report: "first", at: "2024-01-01T00:00:00.000Z" },
    { type: "audit_result", goalId: "g1", verdict: "approved", report: "second", at: "2024-01-01T00:00:01.000Z" },
  ];

  const result = latestAuditorResultForGoal(events, "g1");
  assert.equal(result?.verdict, "approved");
  assert.equal(result?.report, "second");
});

test("latestEventsForGoal returns capped recent events", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "a", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "b", at: "2024-01-01T00:00:02.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "c", at: "2024-01-01T00:00:03.000Z" },
  ];

  const result = latestEventsForGoal(events, "g1", 2);
  assert.equal(result.length, 2);
  assert.equal((result[0] as { reason: string }).reason, "b");
  assert.equal((result[1] as { reason: string }).reason, "c");
});

test("latestGoalLifecycleEvent returns last event for goal", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "a", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_created", goalId: "g2", objective: "o2", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:02.000Z" },
  ];

  const result = latestGoalLifecycleEvent(events, "g1");
  assert.equal(result?.type, "goal_paused");
});

test("appendGoalEvent handles multiple sequential appends", () => {
  const ctx = tempCtx();
  for (let i = 0; i < 5; i++) {
    appendGoalEvent(ctx, {
      type: "goal_created",
      goalId: `g${i}`,
      objective: `obj${i}`,
      sisyphus: false,
      autoContinue: true,
      at: new Date().toISOString(),
    });
  }

  const result = readGoalLedger(ctx);
  assert.equal(result.events.length, 5);
  cleanup(ctx);
});

test("reconstructGoalLedger handles empty events", () => {
  const state = reconstructGoalLedger([]);
  assert.equal(state.focusedGoalId, null);
  assert.equal(state.goals.size, 0);
  assert.equal(state.terminalGoals.size, 0);
});

test("reconstructGoalLedger defaults missing status to paused in goal_paused", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "user", at: "2024-01-01T00:00:01.000Z" },
  ];
  const state = reconstructGoalLedger(events);
  assert.equal(state.goals.get("g1")?.latestStatus, "paused");
});

test("reconstructGoalLedger creates stub state for terminal events without prior goal_created", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_completed", goalId: "legacy-g1", at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_aborted", goalId: "legacy-g2", reason: "obsolete", at: "2024-01-01T00:00:01.000Z" },
  ];
  const state = reconstructGoalLedger(events);
  assert.equal(state.terminalGoals.get("legacy-g1")?.latestStatus, "complete");
  assert.equal(state.terminalGoals.get("legacy-g1")?.completedAt, "2024-01-01T00:00:00.000Z");
  assert.equal(state.terminalGoals.get("legacy-g2")?.latestStatus, "aborted");
  assert.equal(state.terminalGoals.get("legacy-g2")?.abortedAt, "2024-01-01T00:00:01.000Z");
});

test("appendGoalEvent persists goal_paused with status field", () => {
  const ctx = tempCtx();
  appendGoalEvent(ctx, {
    type: "goal_paused",
    goalId: "g1",
    reason: "user",
    status: "paused",
    suggestedAction: "Check credentials",
    at: "2024-01-01T00:00:00.000Z",
  });

  const result = readGoalLedger(ctx);
  assert.equal(result.events.length, 1);
  const evt = result.events[0] as { type: string; status?: string; reason: string };
  assert.equal(evt.type, "goal_paused");
  assert.equal(evt.status, "paused");
  assert.equal(evt.reason, "user");
  cleanup(ctx);
});

test("reconstructGoalLedger handles repeated pause and resume events", () => {
  const events: GoalLedgerEvent[] = [
    { type: "goal_created", goalId: "g1", objective: "o1", sisyphus: false, autoContinue: true, at: "2024-01-01T00:00:00.000Z" },
    { type: "goal_focused", goalId: "g1", reason: "created", at: "2024-01-01T00:00:01.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "user", status: "paused", at: "2024-01-01T00:00:02.000Z" },
    { type: "goal_resumed", goalId: "g1", reason: "user", at: "2024-01-01T00:00:03.000Z" },
    { type: "goal_paused", goalId: "g1", reason: "user", at: "2024-01-01T00:00:04.000Z" },
    { type: "goal_resumed", goalId: "g1", reason: "user", at: "2024-01-01T00:00:05.000Z" },
    { type: "goal_completed", goalId: "g1", at: "2024-01-01T00:00:06.000Z" },
  ];

  const state = reconstructGoalLedger(events);
  assert.equal(state.focusedGoalId, null);
  assert.equal(state.goals.size, 0);
  assert.equal(state.terminalGoals.size, 1);
  const g1 = state.terminalGoals.get("g1");
  assert.ok(g1);
  assert.equal(g1?.latestStatus, "complete");
  assert.equal(g1?.completedAt, "2024-01-01T00:00:06.000Z");
  // goal_resumed clears pauseReason, so latestPauseReason should be undefined
  assert.equal(g1?.latestPauseReason, undefined);
});
