Mysterio — Phase 3 ("Maple Hollow — World & Reputation"). Prod is live on Postgres.

## Where we are
Spec **3d (World Surfaces) is MERGED** (PR #16, merge 1220289) and Spec **3f (open-ended generation
+ one-tap Start) is BUILT** on `feat/open-ended-generation-3f` (branched from main @ 1220289).

3f changes (subagent-driven, 6 task-commits 8c86724..0791964):
- **Schema:** `LogicStructure.category` enum → free-text `case_type: string(3..60)`. `CATEGORY_IDS`/
  `CategoryId` kept ONLY as a legacy display lookup for the 24 old mysteries. No DB migration —
  `mysteries.category` (text) now stores the invented `case_type`.
- **Generation:** logic-structure prompt reframed open-ended ("invent ANY kid case set in Maple
  Hollow, in one provided place, featuring ≥1 provided townsperson; emit case_type"); category-
  plausibility rule removed. Cover prompt + narrative + redact + validation all thread `case_type`.
- **Gate:** orchestrator enforces ≥1 roster resident via the existing `previousFailureNotes` regen
  loop (`usesRosterResident` in roster.ts; skipped when roster unseeded). Stubbed orchestrator test
  proves regenerate-then-accept.
- **Presets + one-tap:** `POST /api/mysteries/generate { player_id }` only — reads the player's
  `default_difficulty` + `age_range`; optional debug-only `{ difficulty?, case_type_hint? }`. Recent
  ready `case_type`s passed as an anti-repetition "avoid" list. Web home collapsed to a single
  "Start a new case" button; CategoryGrid + DifficultyPicker deleted.

## Gate status (all green, local)
`pnpm -r typecheck` ✅ · `pnpm -r test` ✅ (server 185 passed / 1 skipped nightly) · web build ✅.
Note: after any change to packages/shared, run `pnpm --filter @mysterio/shared build` so server/web
typecheck against the refreshed dist.

## Minor findings deferred to final review (non-blocking)
- logicStructure.test.ts uses `const base = valid` (alias, no functional risk).
- style.test.ts doesn't assert the `caseType` value appears in the cover prompt (Scene line value
  untested). Other cover-prompt fields ARE asserted.

## Open validation (USER, paid LLM/image — your call)
Deploy the branch to exe.dev (`scripts/deploy.sh`), then on https://panther-golem.exe.xyz/ tap
**Start a new case** once and confirm: preset-tuned difficulty/age, town-set, ≥1 resident, coherent
free-text `case_type` in title + cover, NO category/difficulty pickers. Legacy 24 still render.

## Next steps
1. Final whole-branch review, then merge to main (PR) + deploy.
2. After merge: **Spec 3e — HQ casebook desk** (last of the 6-spec World program; its "＋ New case"
   action reuses 3f's button). Design: docs/superpowers/specs/2026-06-08-3e-*.md. Order was 3f → 3e.

First read memories: project_phase3_world_specs_written, project_spec3d_world_surfaces_built,
project_stack_facts_actual, workflow_subagent_driven, feedback_deploy_for_ipad_testing.
