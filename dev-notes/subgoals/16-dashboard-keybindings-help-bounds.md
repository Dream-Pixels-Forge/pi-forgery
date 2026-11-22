# SG-16 — Dashboard: keybindings, help & index bounds

- **Status:** done
- **Priority:** P0
- **Area:** `src/ui/dashboard.ts`

## Problem
- The help text says `f=filter · [/] step run`, but `f` is not handled. The filter is actually on tab and the arrow keys.
- `]` **decrements** `runIndex`, which is backwards.
- `runIndex` can become -1, and `entityIndex` is unbounded and isn't reset when the filter or run changes. Both can select nothing or crash.
- In the settings view, Enter closes the overlay instead of toggling or editing the setting.

## Evidence
- `src/ui/dashboard.ts`: `handleInput` key switch, help string, settings Enter branch

## Proposed design
- One declarative keymap that drives both handling and the help bar, so the two can't drift:
```ts
const KEYS: KeyBinding[] = [
  { keys: ["left", "["],  label: "prev run",   run: s => s.prevRun() },
  { keys: ["right", "]"], label: "next run",   run: s => s.nextRun() },
  { keys: ["up", "k"],    label: "select",     run: s => s.move(-1) },
  { keys: ["down", "j"],  label: "",           run: s => s.move(+1) },
  { keys: ["tab"],        label: "pane",       run: s => s.nextPane() },
  { keys: ["f"],          label: "filter",     run: s => s.cycleFilter() },
  { keys: ["enter"],      label: "details",    run: s => s.toggleDetails() },
  { keys: ["?"],          label: "help",       run: s => s.toggleHelp() },
  { keys: ["escape","q"], label: "close",      run: s => s.closeOrBack() },
];
```
- `?` opens a full help overlay listing every binding.
- Every index goes through `clamp(i, 0, len-1)`. Changing the run or filter resets `entityIndex` to 0.
- Settings: Enter toggles or edits the setting. Esc goes back, and only Esc at the root closes the overlay.

## Acceptance criteria
- [ ] The help bar is generated from `KEYS`. A test asserts every listed key is handled.
- [ ] `]` and → go to the next run; `[` and ← go to the previous one.
- [ ] Indices never go out of range (property test with random key sequences).
- [ ] Settings Enter no longer closes the overlay.

## Tests
- A keymap/help consistency test.
- A random key-sequence fuzz test asserting the index invariants.

## Notes / out of scope
- Rebindable keys are out of scope.
