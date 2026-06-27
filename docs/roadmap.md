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

## Next Slice: Builder Trust

- Undo/redo for workout edits.
- Inline validation per workout/block/cue.
- Keep builder validation aligned with export validation.

## P0: Builder Presets

- Add block presets:
  - Warmup ramp
  - Cooldown ramp
  - Endurance steady
  - Sweet spot interval
  - Threshold over/under
  - VO2 30/15
  - Sprint/anaerobic set

## P0: Improve The Workout Library

- Add search/filter/sort by duration, category, and difficulty.
- Add favorite/starred workouts.
- Add recently edited workouts.
- Add stronger empty states.

## P0: Tighten Export Confidence

- Add file naming controls.
- Test exports manually in TrainerRoad Workout Creator and document what works.

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

1. Undo/redo for workout edits.
2. Inline validation per workout/block/cue.
3. Keep builder validation aligned with export validation.
