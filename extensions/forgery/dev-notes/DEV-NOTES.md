# Development Notes

## Implementation Progress

### v0.2.0 Features Completed
- [x] Configuration module (forgery.json loader) with layered defaults
- [x] Git branch reader (cached, throttled)
- [x] Core-tool activity capture (session run)
- [x] Compact exec renderCall/renderResult components in dashboard
- [x] Budget enforcement (per-run cost/token caps)
- [x] Guardrails (write/edit/bash policies + confirm gate)
- [x] Wiring host pi.exec, config, capture, renderers into tool + index.ts
- [x] Skills tree (SKILL.md + exec-patterns reference) + package.json bumps
- [ ] README + dev-notes updates (in progress)
- [ ] Full verify (strict tsc + all tests + pi smoke)
- [ ] Branch, push, PR, memorius

### Key Architectural Decisions

#### Activity Store Design
- Single source of truth for all UI components
- Revision-based change notifications for efficient UI updates
- Bounded collections to prevent memory growth in long sessions
- Separation of concerns: store is pure (no host/fs/timers)

#### Configuration System
- Three-layer precedence: defaults → global → project
- Runtime validation with fallback to defaults
- Invalid values never cause extension failure
- Unparseable JSON files are ignored entirely

#### Security Model
- Static schema validation using TypeBox before execution
- Host proxy limits access to registered tools only
- Guardrail policies enforced at execution time
- No arbitrary property access or eval capabilities

#### UI Rendering Strategy
- Dumb presenters that read from activity store snapshots
- Controller handles refresh scheduling and mounting/unmounting
- Debounced updates (~100ms) to prevent excessive rendering
- Focus management for widget interaction

### Testing Strategy
- Unit tests for all pure functions (config, formatting, etc.)
- Integration tests for activity store mutations
- End-to-end scenarios for tool execution
- Test isolation with temporary directories
- Mock-free tests where possible

### Performance Considerations
- Lazy snapshotting in activity store to reduce copy overhead
- Bounded collections prevent unlimited growth
- Debounced UI updates reduce rendering frequency
- Efficient data structures for lookups and iterations

## Future Enhancement Ideas

### v0.3.0
- Persistent activity storage (save/restore sessions)
- Advanced filtering and search in dashboard
- Custom widget extensions via plugin system
- Integration with external monitoring tools
- Machine learning-based usage prediction

### v0.4.0
- Collaborative features (shared sessions)
- Advanced visualization (charts, graphs)
- Export/import activity logs
- Template library for common workflows

## Known Issues and Limitations

### Current Limitations
- Activity store is purely in-memory (not persisted across sessions)
- Budget enforcement is approximate (estimates rather than precise measurements)
- Guardrail confirmation requires explicit `confirm: true` in tool calls
- No API for programmatic UI customization from within forgery_exec

### Test Coverage Gaps
- Edge cases in configuration validation
- Concurrent session scenarios
- Error recovery paths
- Performance under extreme load

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Run full test suite: `npm test`
4. Verify type checking: `npm run typecheck`
5. Build distribution: `npm run build`
6. Create git tag: `vX.Y.Z`
7. Push changes and tags