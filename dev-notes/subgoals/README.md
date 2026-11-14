# UI Subgoals — Index

These subgoals come from the UI review of the forgery extension, which covers the widget, footer, status line and `/forgery` dashboard.
Each file is self-contained. It lists the problem, the evidence, a proposed design, acceptance criteria and tests.
Nothing has been implemented yet.

| # | Subgoal | Priority | Area | Depends on |
|---|---------|----------|------|------------|
| 01 | [status-glyph-color-tokens](01-status-glyph-color-tokens.md) | P0 | shared | — |
| 02 | [width-safe-text-primitives](02-width-safe-text-primitives.md) | P0 | shared | — |
| 03 | [widget-card-layout](03-widget-card-layout.md) | P1 | widget | — |
| 04 | [agent-rows-aligned-metrics](04-agent-rows-aligned-metrics.md) | P1 | widget | — |
| 05 | [subgoal-tree-connectors](05-subgoal-tree-connectors.md) | P1 | widget | — |
| 06 | [widget-focus-selection-expand](06-widget-focus-selection-expand.md) | P1 | widget | 04, 07 |
| 07 | [widget-row-budget-haschanged](07-widget-row-budget-haschanged.md) | P0 | widget | 02 |
| 08 | [widget-finished-run-summary](08-widget-finished-run-summary.md) | P2 | widget | 01, 02, 03 |
| 09 | [footer-priority-responsive-segments](09-footer-priority-responsive-segments.md) | P1 | footer | 02 |
| 10 | [footer-two-line-layout-fix](10-footer-two-line-layout-fix.md) | P1 | footer | 09, 14 |
| 11 | [footer-context-gauge-thresholds](11-footer-context-gauge-thresholds.md) | P1 | footer | 01, 09 |
| 12 | [footer-model-effort-labels](12-footer-model-effort-labels.md) | P2 | footer | 23 |
| 13 | [footer-ci-issues-pr-cleanup](13-footer-ci-issues-pr-cleanup.md) | P2 | footer | — |
| 14 | [time-based-spinner-clock](14-time-based-spinner-clock.md) | P0 | shared | — |
| 15 | [dashboard-panels-run-tabs-summary](15-dashboard-panels-run-tabs-summary.md) | P1 | dashboard | 02, 04, 05, 16 |
| 16 | [dashboard-keybindings-help-bounds](16-dashboard-keybindings-help-bounds.md) | P0 | dashboard | — |
| 17 | [dashboard-scrolling-height-aware](17-dashboard-scrolling-height-aware.md) | P1 | dashboard | 15, 16 |
| 18 | [dashboard-agent-duration-table-alignment](18-dashboard-agent-duration-table-alignment.md) | P0 | dashboard | 02, 04 |
| 19 | [dashboard-events-timeline](19-dashboard-events-timeline.md) | P2 | dashboard | 15, 16, 17 |
| 20 | [single-status-string-source](20-single-status-string-source.md) | P1 | status | 14 |
| 21 | [widget-mount-stability](21-widget-mount-stability.md) | P1 | widget | 07 |
| 22 | [transcript-pane-scroll-content](22-transcript-pane-scroll-content.md) | P2 | dashboard | 02, 17 |
| 23 | [icon-set-fallback-config](23-icon-set-fallback-config.md) | P2 | shared | — |
| 24 | [agent-run-association](24-agent-run-association.md) | P1 | data | — |
| 25 | [ui-golden-render-tests](25-ui-golden-render-tests.md) | P0 | tests | — |

## Suggested order

1. **P0 foundations:** 01, 02, 14, 07, 16, 18, 25
2. **Widget:** 03, 04, 05, 06, 21, 24
3. **Footer:** 09, 10, 11, 20
4. **Dashboard:** 15, 17, 22
5. **P2 polish:** 08, 12, 13, 19, 23
