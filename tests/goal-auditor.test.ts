import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
	buildGoalAuditorPrompt,
	goalAuditorConfigPath,
	loadGoalAuditorFileConfig,
	parseAuditorDecision,
	parseGoalAuditorConfig,
	saveGoalAuditorFileConfig,
} from "../extensions/goal-auditor.ts";
import type { GoalRecord } from "../extensions/goal-record.ts";

function goal(overrides: Partial<GoalRecord> = {}): GoalRecord {
	return {
		id: "g1",
		objective: "Write a complete tutorial, not just a scaffold.",
		status: "active",
		autoContinue: true,
		usage: { tokensUsed: 0, activeSeconds: 0 },
		sisyphus: false,
		createdAt: "2026-05-12T00:00:00.000Z",
		updatedAt: "2026-05-12T00:00:00.000Z",
		...overrides,
	};
}

test("parseAuditorDecision requires explicit approval and lets disapproval win", () => {
	assert.deepEqual(parseAuditorDecision("Looks good\n<approved/>"), { approved: true, disapproved: false });
	assert.deepEqual(parseAuditorDecision("Nope\n<disapproved/>"), { approved: false, disapproved: true });
	assert.deepEqual(parseAuditorDecision("confused <approved/> <disapproved/>"), { approved: false, disapproved: true });
	assert.deepEqual(parseAuditorDecision("no marker"), { approved: false, disapproved: false });
});

test("parseGoalAuditorConfig supports provider/model and thinking_level aliases", () => {
	assert.deepEqual(parseGoalAuditorConfig({ provider: "fireworks", model: "accounts/fireworks/routers/kimi", thinking_level: "high" }), {
		provider: "fireworks",
		model: "accounts/fireworks/routers/kimi",
		thinkingLevel: "high",
	});
	assert.deepEqual(parseGoalAuditorConfig({ provider: " ", model: 123, thinkingLevel: "ludicrous" }), {});
});

test("saveGoalAuditorFileConfig persists UI-editable auditor settings", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-goal-auditor-test-"));
	try {
		const saved = saveGoalAuditorFileConfig(cwd, {
			provider: "fireworks",
			model: "accounts/fireworks/routers/kimi",
			thinkingLevel: "high",
		});
		assert.deepEqual(saved, {
			provider: "fireworks",
			model: "accounts/fireworks/routers/kimi",
			thinkingLevel: "high",
		});
		assert.equal(goalAuditorConfigPath(cwd), path.join(cwd, ".pi", "goal-auditor.json"));
		assert.deepEqual(loadGoalAuditorFileConfig(cwd), saved);
		assert.match(fs.readFileSync(goalAuditorConfigPath(cwd), "utf8"), /"thinking_level": "high"/);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("buildGoalAuditorPrompt demands semantic approval markers", () => {
	const prompt = buildGoalAuditorPrompt({
		goal: goal(),
		completionSummary: "Generated a VitePress scaffold and build passes.",
		detailedSummary: "Goal: tutorial",
	});
	assert.match(prompt, /independent completion auditor/);
	assert.match(prompt, /scaffold-only|alpha scaffold|generated template/);
	assert.match(prompt, /<approved\/>/);
	assert.match(prompt, /<disapproved\/>/);
	assert.match(prompt, /Generated a VitePress scaffold/);
});
