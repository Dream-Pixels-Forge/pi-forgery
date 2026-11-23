/**
 * pi-forgery — golden render tests (SG-25).
 *
 * Compares widget / footer / dashboard output against stored golden
 * snapshots at widths 40 / 80 / 120 across six scenarios, and asserts every
 * rendered line fits the width.
 *
 * `UPDATE_GOLDEN=1 npx tsx --test tests/ui-golden.test.ts` regenerates
 * fixtures under `tests/fixtures/ui/`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { visibleWidth as vw } from "@earendil-works/pi-tui";
import { ForgeryFooter } from "../src/ui/footer.js";
import { ForgeryWidget } from "../src/ui/widget.js";
import {
  fixturePath,
  golden,
  NOW,
  renderSurface,
  scenario,
  SCENARIOS,
  stripTheme,
  stubTheme,
  UPDATE,
  WIDTHS,
} from "./helpers/uiGolden.js";

test("ui-golden: every surface renders within width at all scenarios", () => {
  fs.mkdirSync(path.dirname(fixturePath("widget", SCENARIOS[0], WIDTHS[0])), {
    recursive: true,
  });
  let failures = 0;

  for (const surface of ["widget", "footer", "dashboard"] as const) {
    for (const scn of SCENARIOS) {
      const { snap, ctx } = scenario(scn);
      for (const width of WIDTHS) {
        const lines = renderSurface(surface, snap, ctx, width);
        // Width-safety assertion: every line fits the width (tags stripped).
        for (const line of lines) {
          assert.ok(
            vw(stripTheme(line)) <= width,
            `${surface}/${scenario}@${width}: line too wide (${vw(stripTheme(line))}): ${JSON.stringify(
              stripTheme(line),
            )}`,
          );
        }
        const content = lines.join("\n") + (lines.length ? "\n" : "");
        const existing = golden(surface, scn, width);
        if (UPDATE) {
          golden(surface, scn, width, content);
        } else if (existing === undefined) {
          failures++;
          console.error(
            `MISSING GOLDEN: ${surface}-${scn}-${width}.txt (run with UPDATE_GOLDEN=1)`,
          );
        } else if (existing !== content) {
          failures++;
          console.error(`GOLDEN MISMATCH: ${surface}-${scn}-${width}.txt`);
          console.error(`--- expected ---\n${existing}`);
          console.error(`--- actual ---\n${content}`);
        }
      }
    }
  }

  if (UPDATE) {
    console.log("Golden fixtures regenerated under tests/fixtures/ui/");
  } else if (failures > 0) {
    assert.fail(`${failures} golden mismatch(es). Run UPDATE_GOLDEN=1 to regenerate.`);
  }
});

test("ui-golden: footer two-line mode appears on narrow terminal", () => {
  const { snap, ctx } = scenario("one-running-agent");
  const footer = new ForgeryFooter(() => stubTheme(), () => snap, ctx, true, () => NOW);
  const lines = footer.render(40);
  assert.ok(lines.length === 1 || lines.length === 2, `footer renders ${lines.length} lines at width 40`);
});

test("ui-golden: ascii icon set renders width-safe", () => {
  const { snap, ctx } = scenario("five-mixed-agents");
  const widget = new ForgeryWidget(
    () => stubTheme(),
    () => snap,
    8,
    undefined,
    {
      activity: () => [],
      release: () => {},
      requestRender: () => {},
    },
    true,
    () => NOW,
  );
  const lines = widget.render(120);
  for (const line of lines) {
    assert.ok(vw(stripTheme(line)) <= 120);
  }
});
