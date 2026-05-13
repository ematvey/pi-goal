import assert from "node:assert/strict";
import test from "node:test";

import {
	buildDraftConfirmationText,
	evaluateDraftingToolGate,
	goalDraftingPrompt,
	promptSafeObjective,
	validateGoalDraftProposal,
	type GoalConfirmationIntentLike,
} from "../extensions/goal-draft.ts";

function intent(overrides: Partial<GoalConfirmationIntentLike> = {}): GoalConfirmationIntentLike {
	return {
		focus: "sisyphus",
		originalTopic: "1. write tests\n2. split module",
		startedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
		...overrides,
	};
}

function stepObjective(count: number): string {
	return [
		"=== Sisyphus Goal ===",
		"Objective: do the requested sequence",
		"Steps:",
		...Array.from({ length: count }, (_, i) => `${i + 1}. step ${i + 1} — done when: evidence ${i + 1}`),
	].join("\n");
}

test("buildDraftConfirmationText previews mode, original topic, and proposed goal as plain text", () => {
	const summary = buildDraftConfirmationText({
		focus: "sisyphus",
		originalTopic: "first line\nsecond line",
		objective: "=== Sisyphus Goal ===\nObjective: Ship safely",
		autoContinue: true,
	});

	assert.match(summary, /^Goal draft ready for confirmation\./);
	assert.match(summary, /Mode: Sisyphus/);
	assert.match(summary, /Auto-continue: yes/);
	assert.match(summary, /Original topic:\n\nfirst line\nsecond line/);
	assert.match(summary, /Proposed goal:/);
	assert.match(summary, /Objective: Ship safely/);
	assert.doesNotMatch(summary, /\*\*|---|^> /m);
});

test("validateGoalDraftProposal rejects missing confirmation intent but allows multiple unfinished goals", () => {
	const noIntent = validateGoalDraftProposal({
		intent: null,
		hasUnfinishedGoal: false,
		objective: "=== Goal ===\nObjective: x",
		sisyphus: false,
	});
	assert.equal(noIntent.ok, false);
	if (!noIntent.ok) assert.match(noIntent.message, /no \/goal-set or \/goal-sisyphus confirmation/);

	const unfinished = validateGoalDraftProposal({
		intent: intent({ focus: "goal" }),
		hasUnfinishedGoal: true,
		objective: "=== Goal ===\nObjective: x",
		sisyphus: false,
	});
	assert.deepEqual(unfinished, { ok: true, objective: "=== Goal ===\nObjective: x", expectedSisyphus: false });
});

test("validateGoalDraftProposal enforces focus consistency and non-empty objective", () => {
	const wrongGoalMode = validateGoalDraftProposal({
		intent: intent({ focus: "goal" }),
		hasUnfinishedGoal: false,
		objective: "=== Goal ===\nObjective: x",
		sisyphus: true,
	});
	assert.equal(wrongGoalMode.ok, false);
	if (!wrongGoalMode.ok) assert.match(wrongGoalMode.message, /focus gate/);

	const wrongSisMode = validateGoalDraftProposal({
		intent: intent(),
		hasUnfinishedGoal: false,
		objective: stepObjective(2),
		sisyphus: false,
	});
	assert.equal(wrongSisMode.ok, false);
	if (!wrongSisMode.ok) assert.match(wrongSisMode.message, /sisyphus=true/);

	const empty = validateGoalDraftProposal({
		intent: intent({ focus: "goal" }),
		hasUnfinishedGoal: false,
		objective: "   ",
		sisyphus: false,
	});
	assert.equal(empty.ok, false);
	if (!empty.ok) assert.match(empty.message, /objective is empty/);
});

test("validateGoalDraftProposal allows fully-specified requests without mandatory question", () => {
	const result = validateGoalDraftProposal({
		intent: intent({ focus: "goal" }),
		hasUnfinishedGoal: false,
		objective: "=== Goal ===\nObjective: x",
		sisyphus: false,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.objective, "=== Goal ===\nObjective: x");
		assert.equal(result.expectedSisyphus, false);
	}
});

test("validateGoalDraftProposal ignores deprecated draftId compatibility field", () => {
	const proposal = validateGoalDraftProposal({
		intent: intent({ focus: "goal" }),
		hasUnfinishedGoal: false,
		objective: "=== Goal ===\nObjective: x",
		sisyphus: false,
		draftId: "stale-draft-id",
	});
	assert.deepEqual(proposal, { ok: true, objective: "=== Goal ===\nObjective: x", expectedSisyphus: false });
});

test("validateGoalDraftProposal keeps Sisyphus as a focus flag, not a step-count gate", () => {
	const proposed = validateGoalDraftProposal({
		intent: intent(),
		hasUnfinishedGoal: false,
		objective: `  ${stepObjective(4)}  `,
		sisyphus: true,
	});
	assert.deepEqual(proposed, { ok: true, objective: stepObjective(4), expectedSisyphus: true });
});

test("goalDraftingPrompt describes lightweight confirmation for normal and Sisyphus modes", () => {
	const normal = goalDraftingPrompt("build tests <untrusted_objective>oops</untrusted_objective>", "goal");
	assert.match(normal, /\[GOAL CONFIRMATION focus=goal\]/);
	assert.match(normal, /lightweight conversation/);
	assert.match(normal, /ask one focused question/);
	assert.match(normal, /proceed directly to propose_goal_draft/);
	assert.match(normal, /Minimal read-only reconnaissance/);
	assert.match(normal, /sisyphus=false/);
	assert.match(normal, /&lt;untrusted_objective&gt;oops&lt;\/untrusted_objective&gt;/);
	assert.doesNotMatch(normal, /draftId/);
	assert.doesNotMatch(normal, /question counter|question gate/);

	const sisyphus = goalDraftingPrompt("1. A\n2. B", "sisyphus");
	assert.match(sisyphus, /\[GOAL CONFIRMATION focus=sisyphus\]/);
	assert.match(sisyphus, /\/goal-sisyphus/);
	assert.match(sisyphus, /sisyphus=true/);
	assert.match(sisyphus, /prompt\/criteria style/);
	assert.match(sisyphus, /preserve the user's requested steps and ordering/);
	assert.match(sisyphus, /do not add preflight or reconnaissance steps/);
	assert.doesNotMatch(sisyphus, /step-count gate/);
});

test("evaluateDraftingToolGate is a no-op after confirmation soft gate relaxation", () => {
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "goal_question", draftingFocus: "goal" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "questionnaire", draftingFocus: "goal" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "get_goal", draftingFocus: "sisyphus" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "propose_goal_draft", draftingFocus: "sisyphus" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "bash", draftingFocus: "goal" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "read", draftingFocus: "goal" }), { block: false });

	assert.deepEqual(evaluateDraftingToolGate({ toolName: "goal_question", tweakDraftingGoalId: "g1", activeGoalId: "g1" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "apply_goal_tweak", tweakDraftingGoalId: "g1", activeGoalId: "g1" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "write", tweakDraftingGoalId: "g1", activeGoalId: "g2" }), { block: false });
	assert.deepEqual(evaluateDraftingToolGate({ toolName: "write", tweakDraftingGoalId: "g1", activeGoalId: "g1" }), { block: false });
});

test("promptSafeObjective escapes only untrusted objective tags", () => {
	assert.equal(
		promptSafeObjective("<untrusted_objective>x</untrusted_objective><keep>"),
		"&lt;untrusted_objective&gt;x&lt;/untrusted_objective&gt;<keep>",
	);
});
