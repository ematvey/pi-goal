import {
	displayObjectiveTitle,
	formatDuration,
	formatTokenValue,
	statusLabel,
	truncateText,
} from "./goal-core.ts";
import { cloneGoal, type GoalFocusEntry, type GoalRecord } from "./goal-record.ts";

export function goalPoolFromGoals(goals: Iterable<GoalRecord>): Map<string, GoalRecord> {
	const pool = new Map<string, GoalRecord>();
	for (const goal of goals) {
		if (goal.status !== "complete") pool.set(goal.id, cloneGoal(goal));
	}
	return pool;
}

export function openGoalsFromPool(pool: Map<string, GoalRecord>): GoalRecord[] {
	return Array.from(pool.values())
		.filter((goal) => goal.status !== "complete")
		.sort((a, b) => {
			const byCreated = a.createdAt.localeCompare(b.createdAt);
			return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
		});
}

export function focusedGoalFromPool(pool: Map<string, GoalRecord>, focusedGoalId: string | null): GoalRecord | null {
	if (!focusedGoalId) return null;
	const goal = pool.get(focusedGoalId) ?? null;
	return goal;
}

export function otherOpenGoalCount(pool: Map<string, GoalRecord>, focusedGoalId: string | null): number {
	return openGoalsFromPool(pool).filter((goal) => goal.id !== focusedGoalId).length;
}

export function resolveSessionFocus(args: {
	pool: Map<string, GoalRecord>;
	focusEntry?: GoalFocusEntry | null;
	legacyGoal?: GoalRecord | null;
}): string | null {
	// Only connect to a goal via explicit session focus entry.
	// Never auto-connect: new sessions start unfocused by default.
	// Users must run /goal-focus to select an existing goal.
	const focusedGoalId = args.focusEntry?.focusedGoalId ?? null;
	const focused = focusedGoalId ? focusedGoalFromPool(args.pool, focusedGoalId) : null;
	if (focused && focused.status !== "complete") {
		return focusedGoalId;
	}
	// No explicit focus — stay unfocused. Do NOT fall back to legacyGoal
	// or auto-pick single open goal. That causes cross-session contamination.
	return null;
}

export function goalSelectorLabel(goal: GoalRecord, focusedGoalId: string | null): string {
	const marker = goal.id === focusedGoalId ? "*" : " ";
	const mode = goal.sisyphus ? "sisyphus" : "goal";
	const path = goal.activePath ? ` ${goal.activePath}` : "";
	return `${marker} ${goal.id} | ${statusLabel(goal)} | ${mode} | ${truncateText(displayObjectiveTitle(goal.objective), 72)}${path}`;
}

export function buildGoalListText(pool: Map<string, GoalRecord>, focusedGoalId: string | null): string {
	const open = openGoalsFromPool(pool);
	if (open.length === 0) return "No open goals. Use /goals <topic> or /sisyphus <topic> to discuss, or /goals-set <objective> / /sisyphus-set <objective> to start immediately.";
	const lines = [`Open goals: ${open.length}`, ""];
	for (const goal of open) {
		const focused = goal.id === focusedGoalId ? "*" : " ";
		const mode = goal.sisyphus ? "sisyphus" : "goal";
		const usage = goal.usage.tokensUsed > 0 || goal.usage.activeSeconds > 0
			? ` · ${formatDuration(goal.usage.activeSeconds)} · ${formatTokenValue(goal.usage.tokensUsed).split(" ")[0]}`
			: "";
		lines.push(`${focused} ${goal.id} — ${statusLabel(goal)} · ${mode}${usage}`);
		lines.push(`  ${displayObjectiveTitle(goal.objective)}`);
		if (goal.activePath) lines.push(`  ${goal.activePath}`);
	}
	return lines.join("\n");
}

export function buildUnfocusedOpenGoalsSummary(openGoalCount: number): string {
	return `No goal is focused in this session. ${openGoalCount} open goal${openGoalCount === 1 ? "" : "s"} exist in .pi/goals. Use /goal-focus to choose the session focus before doing goal work.`;
}

export function mergeFocusedGoalWithDisk(args: { memoryGoal: GoalRecord; diskGoal: GoalRecord }): GoalRecord {
	const tokensUsed = Math.max(args.memoryGoal.usage.tokensUsed, args.diskGoal.usage.tokensUsed);
	const activeSeconds = Math.max(args.memoryGoal.usage.activeSeconds, args.diskGoal.usage.activeSeconds);
	return {
		...args.diskGoal,
		usage: { tokensUsed, activeSeconds },
	};
}
