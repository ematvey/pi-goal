# pi-goal Experiments

This directory contains optional end-to-end experiment harness material for `pi-goal`.

The current runtime design validates these behaviors:

- draft-before-run goal creation through `/goal-set` and `/goal-sisyphus`;
- user confirmation through `propose_goal_draft`;
- focused multi-goal execution;
- pause, abort, clear, resume, and tweak lifecycle behavior;
- empty-turn guard for autonomous continuations;
- visible independent completion audit;
- post-compaction resync from durable goal files and ledger events.

Removed experiment scenarios that targeted the old resource-limit lifecycle or fixed-turn continuation guard are no longer part of the harness. New cases should model the current runtime only.

## Running

```bash
cd experiments
bash harness/run.sh <case-name> --count 3 --grade --no-smoke
```

Experiment outputs under `runs/` are generated artifacts and are not part of the package release.
