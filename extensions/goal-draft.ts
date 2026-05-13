export type GoalDraftingFocus = "goal" | "sisyphus";

export interface GoalConfirmationIntentLike {
	focus: GoalDraftingFocus;
	originalTopic: string;
	startedAt?: number;
}

export interface DraftProposalInput {
	intent: GoalConfirmationIntentLike | null;
	hasUnfinishedGoal: boolean;
	objective: string;
	sisyphus?: boolean;
	draftId?: string;
}

export type DraftProposalValidation =
	| { ok: true; objective: string; expectedSisyphus: boolean }
	| { ok: false; message: string; clearDrafting?: boolean };

export type ToolGateDecision =
	| { block: false }
	| { block: true; reason: string };

export function promptSafeObjective(objective: string): string {
	return objective.replace(/<\/?untrusted_objective>/gi, (tag) => tag.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
}

export function buildDraftConfirmationText(args: {
	focus: GoalDraftingFocus;
	originalTopic: string;
	objective: string;
	autoContinue: boolean;
}): string {
	const lines: string[] = [];
	const modeLabel = args.focus === "sisyphus" ? "Sisyphus (prompt/criteria style)" : "Normal goal";
	lines.push("Goal draft ready for confirmation.");
	lines.push("");
	lines.push("Draft details:");
	lines.push(`Mode: ${modeLabel}`);
	lines.push(`Auto-continue: ${args.autoContinue ? "yes" : "no"}`);
	lines.push("");
	lines.push("Original topic:");
	lines.push("");
	lines.push(args.originalTopic.trim());
	lines.push("");
	lines.push("Proposed goal:");
	lines.push("");
	lines.push(args.objective);
	return lines.join("\n");
}

export function evaluateDraftingToolGate(args: {
	toolName: string;
	draftingFocus?: GoalDraftingFocus | null;
	tweakDraftingGoalId?: string | null;
	activeGoalId?: string | null;
	proposeToolName?: string;
	tweakApplyToolName?: string;
	getGoalToolName?: string;
}): ToolGateDecision {
	// Goal confirmation is prompt-guided, not runtime-enforced. The agent should
	// avoid substantive work before confirmation, but minimal reconnaissance is allowed.
	void args;
	return { block: false };
}

export function validateGoalDraftProposal(input: DraftProposalInput): DraftProposalValidation {
	if (input.intent === null) {
		return {
			ok: false,
			message: "propose_goal_draft REJECTED: no /goal-set or /goal-sisyphus confirmation is in progress. Tell the user to invoke /goal-set <topic> or /goal-sisyphus <topic> first.",
		};
	}

	const expectedSisyphus = input.intent.focus === "sisyphus";
	const actualSisyphus = input.sisyphus === true;
	if (actualSisyphus !== expectedSisyphus) {
		return {
			ok: false,
			message: `propose_goal_draft REJECTED (focus gate): confirmation focus is "${input.intent.focus}" (user invoked ${input.intent.focus === "sisyphus" ? "/goal-sisyphus" : "/goal-set"}) but you passed sisyphus=${actualSisyphus}. Set sisyphus=${expectedSisyphus} to match the user's choice, then retry. Do NOT change the user's mode autonomously.`,
		};
	}

	const objective = input.objective.trim();
	if (!objective) {
		return { ok: false, message: "propose_goal_draft REJECTED: objective is empty." };
	}

	return { ok: true, objective, expectedSisyphus };
}

export function goalDraftingPrompt(topic: string, focus: GoalDraftingFocus): string {
	const safeTopic = promptSafeObjective(topic.trim() || "(no topic provided — ask the user what they want to accomplish)");
	const header = focus === "sisyphus"
		? "[GOAL CONFIRMATION focus=sisyphus]\nThe user invoked Sisyphus mode (/goal-sisyphus). Help turn their request into a confirmed goal contract. Do NOT start substantive work yet."
		: "[GOAL CONFIRMATION focus=goal]\nThe user invoked /goal-set. Help turn their request into a confirmed goal contract. Do NOT start substantive work yet.";

	const commonProtocol = [
		"Confirmation protocol:",
		"- Treat this as a lightweight conversation with the user, not a separate long-running runtime phase.",
		"- If the topic is vague, ask one focused question with a recommended default. Use goal_question or goal_questionnaire when a structured answer would help, but plain conversation is acceptable.",
		"- If the topic is already concrete, you may proceed directly to propose_goal_draft.",
		"- The goal contract should make the objective, success criteria, boundaries, constraints, and blocker rule explicit.",
		"- Minimal read-only reconnaissance is allowed only when it improves the goal contract; do not begin implementation before confirmation.",
		"- propose_goal_draft opens the user's Confirm / Continue Chatting dialog. Confirm creates and focuses the goal; Continue Chatting means keep clarifying.",
		"- create_goal is not a shortcut. Direct create_goal calls are rejected so the user keeps explicit say in goal creation.",
	];

	const goalFocusItems = [
		"For /goal-set, propose a normal goal in this shape when ready:",
		"=== Goal ===",
		"Objective: <one-sentence outcome>",
		"Success criteria: <observable evidence the goal is done>",
		"Boundaries: <in scope / out of scope>",
		"Constraints: <hard rules>",
		"If blocked: <default = stop and ask the user>",
		"Call propose_goal_draft with sisyphus=false and autoContinue=true unless the user asked otherwise.",
	];

	const sisyphusFocusItems = [
		"For /goal-sisyphus, remember that Sisyphus is a prompt/criteria style, not a separate step-counter mechanism.",
		"Propose a Sisyphus goal in this shape when ready:",
		"=== Sisyphus Goal ===",
		"Objective: <one-sentence outcome>",
		"Success criteria: <observable evidence the whole ordered goal is done>",
		"Boundaries: <in scope / out of scope>",
		"Constraints: <hard rules, files not to touch, etc.>",
		"Ordered steps: <preserve the user's requested steps and ordering; do not add preflight or reconnaissance steps they did not ask for>",
		"If blocked / unclear / failing: <default = stop and ask the user>",
		"Sisyphus reminder: Work patiently and sequentially. No rushing, no unrequested preflight steps, no improvising around blockers.",
		"Call propose_goal_draft with sisyphus=true and autoContinue=true unless the user asked otherwise.",
	];

	return [
		header,
		"",
		"Topic the user provided:",
		"<goal_topic>",
		safeTopic,
		"</goal_topic>",
		"",
		...commonProtocol,
		"",
		...(focus === "sisyphus" ? sisyphusFocusItems : goalFocusItems),
	].join("\n");
}
