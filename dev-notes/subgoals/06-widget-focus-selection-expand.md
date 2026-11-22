# SG-06 — Widget focus, row selection & expand

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/widget.ts`, `src/ui/controller.ts`

## Problem
- The widget can be focused, but it has no visible cursor. The user can't tell which row Enter would act on.
- Enter never sets `expandedId`, so the "expanded" branch in `render()` can't be reached from the keyboard.
- When something is expanded, the pane is padded out to 12 blank lines whatever the content is. This wastes vertical space above the editor.
- `interaction.release()` calls `focusWidget` when it should hand focus back to the editor, so Esc leaves the user stuck.
- Only agents can be expanded. Subgoals and the run header can't.

## Evidence
- `src/ui/widget.ts`: `handleInput` (Enter path) and `#renderExpanded` (pads to 12 lines)
- `src/ui/controller.ts`: `interaction.release()` → `focusWidget`

## Proposed design
- Add a `selectedIndex` over a flat list of *selectable rows*: run header, agents and subgoals.
- Keys:
  - ↑/↓ or k/j move the selection.
  - Enter toggles expand on the selected row.
  - Esc collapses first; a second Esc releases focus back to the editor.
  - `d` opens the dashboard on the selected entity.
- Selected row: an inverse or accent `▌` gutter marker. Unselected rows get a one-space gutter so nothing shifts.
```
 ▌ ⠹ planner   reading src/auth/session.ts   12  8.1k  41s
   ✓ coder     wrote 3 files                 31 22.4k 1m32s
```
- The expanded pane is sized to its content and capped at `min(12, maxRows - header)`. No blank padding.
- Expanded agent: last N transcript lines (SG-22). Expanded subgoal: acceptance criteria with ✓/○. Expanded run: phases plus totals.
- The hint footer shows only while focused: `↑↓ select · ⏎ expand · d dashboard · esc back` (SG-03).
- Fix `release()` so it restores focus to the editor.

## Acceptance criteria
- [ ] The selection marker is visible while focused and hidden otherwise.
- [ ] Enter expands and collapses the selected row, and `expandedId` is actually set.
- [ ] The expanded pane has no trailing blank lines.
- [ ] Esc returns focus to the editor (verified through the controller test double).
- [ ] The selection clamps when rows disappear, for example when an agent finishes and the list shrinks.

## Tests
- A widget unit test: feed key sequences and assert on `selectedIndex`/`expandedId` and on the rendered gutter marker.
- A controller test: `release()` calls the editor-focus API, not `focusWidget`.

## Notes / out of scope
- Mouse support is out of scope.
- Depends on SG-04 (row model) and SG-07 (row budget).
