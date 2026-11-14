# SG-21 — Widget mount stability (mount once, render many)

- **Status:** todo
- **Priority:** P1
- **Area:** `extensions/forgery/src/ui/controller.ts`, `extensions/forgery/src/ui/widget.ts`

## Problem
`#syncWidget(snap)` calls `setWidget("forgery", factory, …)` on every refresh tick (100 ms) when visible, and `setWidget("forgery", undefined, …)` when hidden. That mounts and unmounts the component over and over. The result is flicker, lost focus and selection state, and wasted work.

## Evidence
- `controller.ts` ~325–334: the factory `(_tui, _theme) => widgetRef` is rebuilt on each mount.
- `controller.ts` ~371–385: `#syncWidget` toggles between mount and unmount based on `shouldShow`.

## Proposed design
- Mount once in `#mountWidget` with a stable factory that captures `tui` (for `requestRender`).
- Visibility becomes internal: `widget.setVisible(bool)`, and `render()` returns `[]` while it is hidden.
- `#syncWidget` turns into `widget.update(snap); widget.invalidate(); tui.requestRender()`. It never calls `setWidget` again.
- Unmount only on `dispose()` and session shutdown.

```ts
#syncWidget(snap) {
  this.#widget.setVisible(shouldShow(snap));
  this.#widget.update(snap);          // marks dirty only if changed (SG-07)
  if (this.#widget.dirty) this.#tui?.requestRender();
}
```

## Acceptance criteria
- [ ] `setWidget("forgery", …)` is called exactly once per session, plus once with `undefined` on dispose.
- [ ] Hiding the widget and then showing it again keeps the selection and expand state (SG-06).
- [ ] No visible flicker during a running pipeline.

## Tests
- In controller.test.ts, use a fake `ui.setWidget` spy, run 50 refresh ticks across show/hide transitions, and assert the call count is 1.
- Widget render returns `[]` when hidden.

## Notes / out of scope
- Depends on SG-07 (`hasChanged` / dirty flag). It enables SG-06.
