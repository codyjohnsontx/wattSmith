# Wattsmith Roadmap

Wattsmith is a percentage-based cycling workout builder. The near-term goal is to make the manual builder, workout library, training rationale, metrics, and export flow strong before adding AI/RAG functionality.

## Product Direction

- Build a trustworthy workout builder first.
- Keep workouts reusable by storing FTP percentage targets, ranges, ramps, and repeat blocks.
- Make the chart, summary, rationale, and export output agree from the same workout model.
- Prepare the data model for future AI/RAG, but do not add the AI layer yet.

## Completed Recently

- Template preview before loading.
- Collapse/expand for blocks and repeat children.
- Start from blank.
- Basic template duplication/use flow.
- Export validation checklist.
- `.mrc` / `.erg` previews.
- Basic profile fields and warnings.
- Starter cited rationale/source registry.
- Session-only undo/redo for workout edits.
- Keyboard shortcuts for undo/redo.
- Inline validation per workout/block/cue.
- Builder validation aligned with export validation.
- Builder Trust test coverage.
- Reusable block library with protected starter blocks and user-created custom blocks.
- Custom block manager for creating, editing, duplicating, deleting, and inserting workout blocks.
- Save-from-workout flow for turning any block or repeat into a reusable component.
- Snapshot insertion so reusable block edits do not mutate existing workouts.
- Reusable block validation/export test coverage.
- Expanded protected starter palette to 60 reusable blocks across warmup, endurance, tempo, sweet spot, threshold, VO2, anaerobic, recovery, cooldown, and general categories.
- Grouped reusable block palette with searchable custom and starter shelves.
- Drag/drop workout building with explicit root/repeat-child drop joints, magnetic insertion previews, and one-step undo/redo commits.
- Workout block drag handles for root and repeat-child reordering, including valid moves between root and repeat containers.
- Reusable block modal accessibility hardening with dialog semantics, focus trapping, Escape close, and safer localStorage persistence.
- Library sort (recently edited, duration, name, hardest) with derived difficulty filtering alongside search and category.
- Favorite/starred workouts pinned to the top of the saved list, persisted without touching edit timestamps.
- Recently edited as the default library sort with "Edited Nm ago" metadata on each saved workout.
- Onboarding and filtered empty states for the saved and template library columns, with clear-filters and start-blank actions.
- Export file naming controls with sanitization, readiness-check integration, and matching embedded file headers.
- Committed export fixture files plus `npm run generate:export-fixtures` and a TrainerRoad testing procedure/results doc.

## Next Slice: Export Verification And Rationale

- Run the manual TrainerRoad Workout Creator pass in `docs/export-testing.md` and fill in the results matrix (human step).
- Then start the P1 science/rationale work.

## P0: Tighten Export Confidence

- Test exports manually in TrainerRoad Workout Creator and record results in `docs/export-testing.md` (fixtures and procedure are ready).

## P1: Build Science And Rationale Without AI

- Add workout-specific rationale for every template.
- Add approved source registry.
- Add citation badges/cards.
- Add "why this workout works" section.
- Add "who should modify this" section.
- Add beginner, standard, and advanced versions for templates.

## P1: Improve Training Metrics

- Make IF/TSS/NP-style estimates clearer and cite assumptions.
- Add intensity distribution visualization.
- Add work/rest ratio.
- Add total time above FTP.
- Add high-intensity density warning.
- Add estimated kJ explanation.

## P1: Make Athlete Profile Useful

- Add preferred workout duration.
- Add weekly training hours.
- Add experience level.
- Add event type/goal.
- Add constraints.
- Use profile fields for non-AI warnings:
  - Workout is above preferred duration.
  - Workout has a lot of VO2 time for a new rider.
  - Workout is mostly recovery, endurance, threshold, VO2, or anaerobic.

## P2: Prepare For Future AI/RAG

- Add `WorkoutIntent` type.
- Add `WorkoutRationale` coverage for templates and workouts.
- Add `Source` registry.
- Add `DecisionNote` or `TrainingExplanation` type.
- Add schema validation for generated/imported workouts.
- Keep all workouts percentage-based and export-safe.

## Later: AI/RAG Layer

Do not start this until the manual builder and rationale system are stronger.

- AI assistant can suggest, explain, and revise workouts.
- RAG answers must cite approved sources.
- Generated workouts must validate against the same workout model before display/export.
- User remains in control of accepting, editing, or rejecting suggestions.

## Recommended Next Slice

1. Complete the manual TrainerRoad export pass and document results in `docs/export-testing.md`.
2. Add workout-specific rationale for every template.
3. Add citation badges/cards backed by the approved source registry.
