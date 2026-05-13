# Experiment Plan

The experiment suite is an optional end-to-end harness for checking `pi-goal` behavior with real pi sessions and model calls.

Current coverage goals:

1. Drafting starts from `/goal-set` or `/goal-sisyphus` and converges on a concrete objective.
2. Goal creation goes through `propose_goal_draft` and user confirmation.
3. Focus remains human-owned when multiple open goals exist.
4. Active goals continue only after meaningful work, not after empty chat turns.
5. `pause_goal` is used for real blockers.
6. `abort_goal` is used for obsolete, impossible, unsafe, or user-cancelled work.
7. `update_goal(status="complete")` is used only when evidence satisfies the objective and can survive the independent auditor.
8. Post-compaction prompts reconstruct the focused goal from durable files and ledger events.

Retired scenarios tied to removed resource-limit or fixed-turn continuation-guard designs should not be reintroduced unless the product explicitly brings those lifecycles back.
