# SG-23 — Selectable icon sets (unicode / ascii / nerd)

- **Status:** todo
- **Priority:** P2
- **Area:** `extensions/forgery/src/ui/format.ts`, config schema

## Problem
The glyphs are emoji or Unicode only. Some, like `📁`, have an ambiguous width and break alignment in many terminals. There is no ASCII fallback for limited terminals and no nerd-font option for users who want richer icons. The spinner frames are also fixed.

## Evidence
- `format.ts:20`: `SPINNER_FRAMES = ["⠋","⠙",…]`, picked at line 24 with `frameIndex % length`.
- Emoji glyphs such as `📁` are used directly in the footer and widget strings.

## Proposed design
```ts
type IconSetName = "unicode" | "ascii" | "nerd";
interface IconSet { running; done; failed; stopped; queued; folder; branch; spinner: string[] }
const ICONS: Record<IconSetName, IconSet> = {
  unicode: { running:"●", done:"✓", failed:"✗", stopped:"■", queued:"○", folder:"▸", branch:"⎇", spinner:["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"] },
  ascii:   { running:"*", done:"+", failed:"x", stopped:"#", queued:".", folder:">", branch:"@", spinner:["|","/","-","\\"] },
  nerd:    { running:"", done:"", failed:"", stopped:"", queued:"", folder:"", branch:"", spinner:["","","","","",""] },
};
```
- Config key `ui.icons` (default `unicode`). It also reads the env override `FORGERY_ICONS`.
- Every glyph must be width 1 according to `visibleWidth`, with no emoji in the default set.

## Acceptance criteria
- [ ] All UI glyphs are looked up through `icons()`, and grep finds no literal status glyphs in the UI files.
- [ ] `📁` and other ambiguous-width emoji are removed from the default set.
- [ ] Switching sets requires no restart (the next render picks it up).

## Tests
- format.test.ts: every glyph in every set has `visibleWidth === 1`, and every spinner array is non-empty.
- Golden snapshots (SG-25) are rendered with the `ascii` set.

## Notes / out of scope
- It feeds SG-01 (color tokens pair with glyphs) and SG-12 (model/effort labels).
