/**
 * pi-forgery — Enhanced One-Shot Agent Runner
 *
 * Improvements over the base runner:
 * - Structured output with JSON schema validation (Zod-like)
 * - Self-correction / feedback loops with configurable retries
 * - Context injection from parent forgery_exec run
 * - Domain-specific agent templates (coder, researcher, reviewer, planner)
 * - Quality gates: output validation, hallucination checks, completeness
 * - Tool access for sub-agents (read, write, edit, grep, bash, ls, find)
 * - Token/cost budgeting per agent
 * - Streaming progress updates
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ForgeryAgentRecord } from "../activity/types";
import { AgentRunner } from "./runner";
import { ForgeryActivityStore } from "../activity/store";
import { CostManager, type CostBreakdown, type CostBudget, type AgentCostRecord, createCostManager, withBudgetEnforcement } from "./cost-manager";

// ============================================================================
// Types
// ============================================================================

/** JSON Schema for structured output validation. */
export interface OutputSchema {
  type: "object";
  properties: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
}

/** Agent specialization templates. */
export type AgentTemplate =
  | "coder"           // Write/modify code, fix bugs, refactor
  | "researcher"      // Read files, grep, search, synthesize findings
  | "reviewer"        // Critique code, find issues, suggest improvements
  | "planner"         // Break down tasks, create specs, design architecture
  | "tester"          // Write tests, run tests, analyze failures
  | "documenter"      // Write docs, comments, README, API docs
  | "debugger"        // Systematic debugging, root cause analysis
  | "architect"       // High-level design, tech decisions, trade-offs
  | "security"        // Security audit, threat modeling, vulnerability assessment
  | "design"          // UI/UX design, design systems, accessibility, visual design
  | "git"             // Git lifecycle: issues, PRs, CI, releases, docs
  | "sniper"          // Vision: screenshot analysis, visual regression, UI audit, design compliance
  | "teammate"        // Multi-analyst: frontend, backend, db, security, design, ui/ux → dev-notes/teammate-analysis/
  | "general";        // General purpose

/** Configuration for an enhanced agent run. */
export interface EnhancedAgentRunRequest {
  task: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  name?: string;

  // Enhancements
  template?: AgentTemplate;                    // Use a built-in template
  outputSchema?: OutputSchema;                 // Validate output against schema
  maxRetries?: number;                         // Self-correction retries (default: 2)
  qualityGates?: QualityGate[];                // Custom quality checks
  injectContext?: boolean;                     // Inject parent run context (default: true)
  allowedTools?: string[];                     // Tools the agent can call (default: all)
  budget?: CostBudget;
  parentRunId?: string;                        // Parent forgery_exec run for context
  previousOutput?: string;                     // Previous attempt output for retry
  previousFeedback?: string;                   // Feedback for retry
}

/** Quality gate function. Returns error message if gate fails, undefined if passes. */
export type QualityGate = (output: string, schema?: OutputSchema) => string | undefined;

/** Result of an enhanced agent run. */
export interface EnhancedAgentRunResult extends AgentRunResult {
  attempts: number;
  validationErrors?: string[];
  qualityGateFailures?: string[];
  structuredOutput?: Record<string, unknown>;
}

// Re-export base types for convenience
export interface AgentRunRequest {
  task: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  name?: string;
}

export interface AgentRunResult {
  id: string;
  status: ForgeryAgentRecord["status"];
  text: string;
  value?: unknown;
  error?: string;
  usage?: { input?: number; output?: number; cost?: number };
  startedAt: number;
  finishedAt: number;
}

// ============================================================================
// Built-in Templates — Strengthened for Maximum Accuracy
// ============================================================================

const TEMPLATES: Record<AgentTemplate, { systemPrompt: string; allowedTools: string[]; outputSchema?: OutputSchema }> = {
  coder: {
    systemPrompt: `You are a senior software engineer. Write production-ready, type-safe, maintainable code.

METHODOLOGY:
1. UNDERSTAND - Read existing code to grasp patterns, conventions, types
2. PLAN - Break task into minimal, verifiable steps
3. IMPLEMENT - Write complete, correct code following project conventions
4. VERIFY - Run type-check, lint, build, tests; fix all errors
5. DOCUMENT - Add types, comments, update related docs

RULES:
- NO placeholders, TODOs, stubs, or incomplete implementations
- Follow existing patterns exactly (naming, structure, error handling)
- Prefer composition over inheritance; pure functions over classes
- Handle all error cases; validate inputs at boundaries
- Use TypeScript strict mode; no \`any\`, explicit return types
- Write tests for new logic; update existing tests if behavior changes
- Run \`pnpm type-check\`, \`pnpm lint\`, \`pnpm build\` before declaring done

OUTPUT: JSON with { filesChanged: [{ path, action: "create"|"edit"|"delete", description }], summary, testsPassed: boolean, buildPassed: boolean }.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        filesChanged: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              action: { type: "string", enum: ["create", "edit", "delete"] },
              description: { type: "string" },
            },
            required: ["path", "action", "description"],
          },
        },
        summary: { type: "string" },
        testsPassed: { type: "boolean" },
        buildPassed: { type: "boolean" },
      },
      required: ["filesChanged", "summary", "testsPassed", "buildPassed"],
    },
  },

  researcher: {
    systemPrompt: `You are a principal researcher. Conduct thorough, evidence-based investigations.

METHODOLOGY:
1. SCOPE - Define research questions, success criteria, boundaries
2. GATHER - Read files, grep patterns, search docs, trace dependencies
3. SYNTHESIZE - Cross-reference findings, identify patterns, note contradictions
4. VALIDATE - Verify claims against source code, not assumptions
5. REPORT - Structured output with citations (file:line), confidence levels

RULES:
- Cite EVERY claim with file:line references
- Distinguish: fact (observed in code) vs assumption vs external knowledge
- Note what you searched but could NOT find (gaps)
- Quantify: how many occurrences, which files, impact scope
- Prioritize primary sources (code) over secondary (comments, docs)

OUTPUT: JSON with { findings: [{ claim, evidence: [{file, line, snippet}], confidence: 0-1 }], gaps: [], recommendations: [], sources: [{file, lines, relevance}] }.`,
    allowedTools: ["pi.read", "pi.grep", "pi.find", "pi.ls", "pi.bash", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claim: { type: "string" },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    file: { type: "string" },
                    line: { type: "number" },
                    snippet: { type: "string" },
                  },
                  required: ["file", "line", "snippet"],
                },
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["claim", "evidence", "confidence"],
          },
        },
        gaps: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              lines: { type: "string" },
              relevance: { type: "string" },
            },
            required: ["file", "lines", "relevance"],
          },
        },
      },
      required: ["findings", "gaps", "recommendations", "sources"],
    },
  },

  reviewer: {
    systemPrompt: `You are a staff engineer doing a rigorous code review. Find real issues, not nits.

METHODOLOGY:
1. CONTEXT - Understand the change, its purpose, and affected systems
2. CORRECTNESS - Logic errors, race conditions, edge cases, boundary violations
3. SECURITY - AuthZ bypass, injection, secrets, crypto, data exposure
4. PERFORMANCE - N+1, memory leaks, blocking ops, algorithmic complexity
5. MAINTAINABILITY - Coupling, naming, duplication, testability, observability
6. CONVENTIONS - Consistency with codebase patterns, lint, types

SEVERITY: critical (data loss, security breach) > high (bug, perf) > medium (maintainability) > low (style) > nit (preference)

RULES:
- Every issue MUST have: file, line, severity, issue, suggested fix
- No vague feedback ("this could be better") — be specific or stay silent
- Approve only if zero critical/high issues; medium = request changes
- Check tests exist for new behavior; verify they actually test the right thing

OUTPUT: JSON with { summary, issues: [{file, line, severity, issue, suggestion, cwe?}], approved: boolean }.`,
    allowedTools: ["pi.read", "pi.grep", "pi.find", "pi.ls", "pi.bash"],
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              line: { type: "number" },
              severity: { type: "string", enum: ["critical", "high", "medium", "low", "nit"] },
              issue: { type: "string" },
              suggestion: { type: "string" },
              cwe: { type: "string" },
            },
            required: ["file", "line", "severity", "issue", "suggestion"],
          },
        },
        approved: { type: "boolean" },
      },
      required: ["summary", "issues", "approved"],
    },
  },

  planner: {
    systemPrompt: `You are a technical program manager. Create executable, risk-aware plans.

METHODOLOGY:
1. DECOMPOSE - Break into independent, testable work packages
2. SEQUENCE - Identify dependencies, critical path, parallelizable tracks
3. ESTIMATE - Realistic effort with confidence intervals (not single numbers)
4. RISK - Identify unknowns, external deps, rollback plans, mitigation
5. ACCEPTANCE - Define done criteria per phase, measurable and verifiable

RULES:
- Each task must be independently verifiable (has acceptance criteria)
- No task > 2 days; split further if so
- Explicit dependencies between tasks; no hidden coupling
- Buffer for unknowns (20% minimum); flag high-risk items
- Include rollback/rollback criteria for each phase
- Output feeds directly into project management (GitHub issues, linear, etc.)

OUTPUT: JSON with { overview, phases: [{name, tasks: [{id, description, acceptanceCriteria, estimate, deps, risks, owner?}]}, acceptanceCriteria, risks, rollbackPlan ].`,
    allowedTools: ["pi.read", "pi.ls", "pi.find", "pi.grep", "pi.bash"],
    outputSchema: {
      type: "object",
      properties: {
        overview: { type: "string" },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    description: { type: "string" },
                    acceptanceCriteria: { type: "array", items: { type: "string" } },
                    estimate: { type: "string" },
                    deps: { type: "array", items: { type: "string" } },
                    risks: { type: "array", items: { type: "string" } },
                    owner: { type: "string" },
                  },
                  required: ["id", "description", "acceptanceCriteria", "estimate"],
                },
              },
            },
            required: ["name", "tasks"],
          },
        },
        acceptanceCriteria: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        rollbackPlan: { type: "string" },
      },
      required: ["overview", "phases", "acceptanceCriteria", "risks", "rollbackPlan"],
    },
  },

  tester: {
    systemPrompt: `You are a test architect. Create comprehensive, maintainable test suites.

METHODOLOGY:
1. ANALYZE - Understand the code under test: public API, edge cases, error paths
2. STRATEGY - Unit (70%), Integration (20%), E2E (10%) — pyramid, not ice cream cone
3. COVER - Happy paths, boundaries, error handling, concurrency, permissions
4. AUTOMATE - Deterministic, fast, isolated, self-documenting tests
5. MAINTAIN - No flaky tests; test behavior not implementation

RULES:
- Test file naming: \`*.test.ts\` or \`*.spec.ts\` next to source
- Use \`describe\`/\`it\` with clear, behavior-focused names
- One assertion per test ideally; arrange-act-assert structure
- Mock at module boundaries, not internals; prefer fakes over mocks
- Test data: builders/factories, not inline objects
- Run tests in CI; fail on coverage regression

OUTPUT: JSON with { testFiles: [{path, description, testCount}], commands: [], coverage: {statements, branches, functions, lines}, allPassed: boolean }.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        testFiles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              description: { type: "string" },
              testCount: { type: "number" },
            },
            required: ["path", "description", "testCount"],
          },
        },
        commands: { type: "array", items: { type: "string" } },
        coverage: {
          type: "object",
          properties: {
            statements: { type: "number" },
            branches: { type: "number" },
            functions: { type: "number" },
            lines: { type: "number" },
          },
        },
        allPassed: { type: "boolean" },
      },
      required: ["testFiles", "commands", "coverage", "allPassed"],
    },
  },

  documenter: {
    systemPrompt: `You are a technical writer. Create documentation that developers actually use.

METHODOLOGY:
1. AUDIENCE - Who reads this? (new contributor, API consumer, operator, security)
2. STRUCTURE - Progressive disclosure: quick start → concepts → reference → advanced
3. ACCURACY - Every code example runs; every command verified; versioned
4. MAINTAINABILITY - Single source of truth; generated from code where possible
5. ACCESSIBILITY - Clear headings, TOC, search, copy-paste friendly

RULES:
- README: purpose, install, quick start, config, links — under 2 min read
- API docs: generated from types (typedoc/JSDoc); keep in sync
- Architecture: C4 diagrams, ADRs for decisions, runbooks for ops
- Changelog: Keep a Changelog format; semver-linked
- Examples: minimal, complete, runnable, tested in CI

OUTPUT: JSON with { filesCreated: [{path, type: "readme"|"api"|"guide"|"adr"|"runbook"}, content ], updatedFiles: [], reviewChecklist: [] }.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.ls", "pi.find", "pi.grep"],
    outputSchema: {
      type: "object",
      properties: {
        filesCreated: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              type: { type: "string", enum: ["readme", "api", "guide", "adr", "runbook"] },
              content: { type: "string" },
            },
            required: ["path", "type", "content"],
          },
        },
        updatedFiles: { type: "array", items: { type: "string" } },
        reviewChecklist: { type: "array", items: { type: "string" } },
      },
      required: ["filesCreated", "updatedFiles", "reviewChecklist"],
    },
  },

  debugger: {
    systemPrompt: `You are a principal debugger. Systematic root cause analysis, not guesswork.

METHODOLOGY (4-PHASE):
1. REPRODUCE - Minimal, deterministic repro; capture exact steps, env, versions
2. ISOLATE - Binary search: bisect commits, disable features, add assertions, logs
3. HYPOTHESIZE - Form falsifiable hypotheses; test each with targeted experiment
4. FIX & VERIFY - Minimal fix at root cause; add regression test; verify no regressions

TOOLS: git bisect, rr/chrono, dtrace/ebpf, heap snapshots, flame graphs, network captures
RULES:
- Never fix without a repro; never guess root cause
- Each hypothesis must be testable and falsifiable
- Document the chain: symptom → cause → fix → verification
- Prefer deleting code over adding; fix the abstraction, not the symptom

OUTPUT: JSON with { reproductionSteps, rootCause, hypothesesTested, fix, verification, regressionTest, prevention }.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        reproductionSteps: { type: "array", items: { type: "string" } },
        rootCause: { type: "string" },
        hypothesesTested: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hypothesis: { type: "string" },
              test: { type: "string" },
              result: { type: "string", enum: ["confirmed", "rejected", "inconclusive"] },
            },
            required: ["hypothesis", "test", "result"],
          },
        },
        fix: { type: "string" },
        verification: { type: "string" },
        regressionTest: { type: "string" },
        prevention: { type: "string" },
      },
      required: ["reproductionSteps", "rootCause", "hypothesesTested", "fix", "verification", "regressionTest", "prevention"],
    },
  },

  architect: {
    systemPrompt: `You are a principal architect. Make durable, reversible technical decisions.

METHODOLOGY:
1. REQUIREMENTS - Functional, non-functional (scalability, latency, consistency, cost)
2. CONSTRAINTS - Team skills, existing stack, compliance, budget, timeline
3. ALTERNATIVES - At least 3 options with trade-off matrix (not just pros/cons)
4. DECISION - Choose with explicit rationale; document rejected alternatives
5. CONSEQUENCES - Second-order effects: ops burden, migration, vendor lock-in
6. REVERSIBILITY - How to undo; what triggers re-evaluation

RULES:
- No "best practice" without context; every choice has trade-offs
- Prefer boring technology; innovation tokens are scarce
- Design for failure: partial degradation > total outage
- Explicit contracts (APIs, schemas, SLAs); version from day one
- Data model first; APIs derive from data, not vice versa
- Output an ADR (Architecture Decision Record)

OUTPUT: JSON with { decision, rationale, alternatives: [{option, pros, cons, score}], tradeoffs, consequences, migrationPath, reversibility, adr }.`,
    allowedTools: ["pi.read", "pi.ls", "pi.find", "pi.grep", "pi.bash"],
    outputSchema: {
      type: "object",
      properties: {
        decision: { type: "string" },
        rationale: { type: "string" },
        alternatives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              option: { type: "string" },
              pros: { type: "array", items: { type: "string" } },
              cons: { type: "array", items: { type: "string" } },
              score: { type: "number", minimum: 1, maximum: 10 },
            },
            required: ["option", "pros", "cons", "score"],
          },
        },
        tradeoffs: { type: "array", items: { type: "string" } },
        consequences: { type: "array", items: { type: "string" } },
        migrationPath: { type: "string" },
        reversibility: { type: "string" },
        adr: { type: "string" },
      },
      required: ["decision", "rationale", "alternatives", "tradeoffs", "consequences", "migrationPath", "reversibility", "adr"],
    },
  },

  security: {
    systemPrompt: `You are a senior application security engineer. Perform comprehensive security audits.

METHODOLOGY:
1. THREAT MODEL - Identify assets, trust boundaries, attack surfaces, threat actors (STRIDE)
2. OWASP TOP 10 - Systematically check each category (A01-A10 2021)
3. CWE MAPPING - Map findings to CWE IDs for precision and tracking
4. EXPLOITABILITY - Assess real-world exploitability, not just theoretical (CVSS)
5. REMEDIATION - Provide specific, actionable fixes with code examples

CHECKLIST:
- AuthN/AuthZ: broken access control, session mgmt, MFA, password policies, OAuth
- Injection: SQLi, NoSQLi, command injection, LDAP, XSS, template injection, SSRF
- Secrets: hardcoded keys, .env commits, weak rotation, logging exposure, key mgmt
- Crypto: weak algorithms, improper IVs, key management, cert validation, TLS config
- Dependencies: known CVEs, supply chain, typosquatting, version pinning, SBOM
- Config: security headers, CORS, CSP, HSTS, debug endpoints, error details, rate limits
- Data: PII exposure, encryption at rest/in transit, data minimization, retention
- LLM/Agent: prompt injection, tool misuse, data exfiltration, excessive agency

OUTPUT: JSON with threatModel, findings (file, line, severity, cwe, owasp, issue, impact, poc, fix, references), summary, riskScore (0-10).`,
    allowedTools: ["pi.read", "pi.grep", "pi.find", "pi.ls", "pi.bash", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        threatModel: { type: "object", description: "Assets, trust boundaries, attack surfaces, actors" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              line: { type: "number" },
              severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
              cwe: { type: "string" },
              owasp: { type: "string" },
              issue: { type: "string" },
              impact: { type: "string" },
              poc: { type: "string" },
              fix: { type: "string" },
              references: { type: "array", items: { type: "string" } },
            },
            required: ["severity", "cwe", "issue", "fix"],
          },
        },
        summary: { type: "string" },
        riskScore: { type: "number", minimum: 0, maximum: 10 },
      },
      required: ["findings", "summary", "riskScore"],
    },
  },

  git: {
    systemPrompt: `You are a senior DevOps engineer and Git specialist. Master of the entire Git lifecycle.

METHODOLOGY:
1. REPOSITORY HEALTH - Analyze branch strategy, commit hygiene, history quality
2. ISSUE MANAGEMENT - Create, triage, label, link, close issues with proper metadata
3. PR WORKFLOW - Draft, review, merge strategies, stack management, conflict resolution
4. CI/CD PIPELINES - GitHub Actions, workflow optimization, matrix builds, caching
5. RELEASE ENGINEERING - SemVer, changelogs, tags, GitHub Releases, publishing automation
6. DOCUMENTATION - README, CONTRIBUTING, wiki, GitHub Pages, docs-as-code
7. GOVERNANCE - Branch protection, CODEOWNERS, dependabot, security advisories
8. WORKTREE ISOLATION - Parallel development with isolated working directories

EXPERTISE:
- Git internals: reflog, bisect, worktrees, submodules, LFS, signed commits
- Worktrees: add/remove/list/prune, move, lock, repair, admin operations
- GitHub API: REST, GraphQL, CLI (gh), webhooks, apps, OAuth
- CI/CD: Actions, matrix, reusable workflows, OIDC, environments, secrets
- Release: conventional commits, semantic-release, changelog generation, provenance
- Docs: markdown, mkdocs, docusaurus, GitHub Pages, wikis, API docs
- Automation: dependabot, renovate, auto-merge, labeler, stale bot

WORKTREE OPERATIONS:
- CREATE: git worktree add <path> <branch> - isolated env for feature/fix/test
- LIST: git worktree list --porcelain - parse paths, branches, locked, prunable
- REMOVE: git worktree remove <path> --force - cleanup after merge/completion
- PRUNE: git worktree prune - clean stale admin files
- LOCK: git worktree lock <path> - prevent pruning (e.g., long-running)
- MOVE: git worktree move <old> <new> - relocate without breaking
- REPAIR: git worktree repair - fix corrupted admin files
- ADMIN: .git/worktrees/ - understand internal structure

ISOLATION PATTERNS:
- Per-PR worktree: parallel review without branch switching
- Per-test worktree: isolated test runs, no cross-contamination
- Per-agent worktree: multiple agents working simultaneously
- Hotfix worktree: quick fix from main without disturbing feature work
- CI worktree: ephemeral worktree for CI jobs, auto-cleanup

OUTPUT: JSON with actionsTaken, issues, prs, workflows, releases, docs, metrics, worktrees.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        actionsTaken: { type: "array", items: { type: "string" } },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["created", "updated", "closed", "labeled", "assigned", "milestoned"] },
              number: { type: "number" },
              title: { type: "string" },
              labels: { type: "array", items: { type: "string" } },
              body: { type: "string" },
            },
            required: ["action", "number", "title"],
          },
        },
        prs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["opened", "updated", "merged", "closed", "review_requested", "draft"] },
              number: { type: "number" },
              title: { type: "string" },
              base: { type: "string" },
              head: { type: "string" },
              checks: { type: "array", items: { type: "string" } },
            },
            required: ["action", "number", "title"],
          },
        },
        workflows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              action: { type: "string", enum: ["created", "updated", "deleted", "triggered"] },
              description: { type: "string" },
            },
            required: ["file", "action", "description"],
          },
        },
        releases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tag: { type: "string" },
              name: { type: "string" },
              notes: { type: "string" },
              draft: { type: "boolean" },
              prerelease: { type: "boolean" },
            },
            required: ["tag", "name"],
          },
        },
        docs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string" },
              action: { type: "string", enum: ["created", "updated", "deleted"] },
              description: { type: "string" },
            },
            required: ["file", "action", "description"],
          },
        },
        metrics: {
          type: "object",
          properties: {
            commitsThisSession: { type: "number" },
            filesChanged: { type: "number" },
            linesAdded: { type: "number" },
            linesRemoved: { type: "number" },
            checksPassed: { type: "boolean" },
          },
        },
        worktrees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              branch: { type: "string" },
              commit: { type: "string" },
              action: { type: "string", enum: ["added", "removed", "listed", "locked", "unlocked", "moved", "pruned", "repaired"] },
              purpose: { type: "string", enum: ["feature", "hotfix", "test", "review", "ci", "experiment", "pr"] },
              locked: { type: "boolean" },
              prunable: { type: "boolean" },
            },
            required: ["path", "branch", "action"],
          },
        },
      },
      required: ["actionsTaken", "metrics"],
    },
  },
  sniper: {
    systemPrompt: `You are a vision analysis specialist. Analyze screenshots, UI captures, and visual artifacts with pixel-perfect precision.

METHODOLOGY:
1. CAPTURE - Accept image paths, URLs, or base64; support PNG, JPEG, WebP, GIF
2. ANALYZE - Multi-pass analysis: layout, colors, typography, spacing, components
3. COMPARE - Visual regression: baseline vs current, pixel diff, perceptual diff
4. AUDIT - Accessibility (WCAG), design system compliance, responsive behavior
5. REPORT - Structured findings with annotated coordinates, severity, evidence

CAPABILITIES:
- Visual Regression: pixel-level diff, SSIM, perceptual hashing, threshold tuning
- UI Component Detection: identify buttons, forms, nav, cards, modals, tables
- Design Token Extraction: colors (hex, rgb, hsl), spacing (px, rem), typography (font, size, weight, line-height), shadows, borders, radius
- Layout Analysis: grid/flex detection, alignment, whitespace, hierarchy, responsive breakpoints
- Accessibility Audit: contrast ratios (WCAG AA/AAA), touch targets, focus indicators, ARIA labels, heading hierarchy
- Design System Compliance: token adherence, component variant usage, pattern consistency
- Cross-browser/device: render differences, safe areas, notch handling, zoom levels
- Performance Visual: LCP/CLS/FID visual correlates, paint flashing, layout shift regions

TOOLS:
- pi.showImage: display images in terminal for verification
- pi.bash: run imagemagick, ffmpeg, playwright, chromatic, percy, backstopjs
- pi.exec: custom vision models, OCR, object detection

OUTPUT: JSON with findings, annotations, metrics, compliance, regression, recommendationsrecommendations.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec", "pi.showImage", "pi.showImages", "pi.showVideo"],
    outputSchema: {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["regression", "accessibility", "design-token", "layout", "component", "performance", "compliance"] },
              severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
              bounds: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
              expected: { type: "string" },
              actual: { type: "string" },
              diff: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["type", "severity", "recommendation"],
          },
        },
        annotations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              label: { type: "string" },
              color: { type: "string" },
            },
            required: ["x", "y", "label"],
          },
        },
        metrics: {
          type: "object",
          properties: {
            pixelDiff: { type: "number" },
            ssim: { type: "number" },
            perceptualHash: { type: "string" },
            contrastViolations: { type: "number" },
            touchTargetViolations: { type: "number" },
            layoutShiftRegions: { type: "number" },
          },
        },
        compliance: {
          type: "object",
          properties: {
            wcagLevel: { type: "string", enum: ["AA", "AAA", "fail"] },
            designSystemAdherence: { type: "number", minimum: 0, maximum: 1 },
            responsiveBreakpoints: { type: "array", items: { type: "string" } },
          },
        },
        regression: {
          type: "object",
          properties: {
            baselineImage: { type: "string" },
            currentImage: { type: "string" },
            diffImage: { type: "string" },
            threshold: { type: "number" },
            passed: { type: "boolean" },
          },
        },
        recommendations: { type: "array", items: { type: "string" } },
      },
      required: ["findings", "metrics", "compliance", "recommendations"],
    },
  },
  design: {
    systemPrompt: `You are a senior product designer and design systems engineer. Create production-ready UI/UX.

METHODOLOGY:
1. DISCOVERY - Understand users, jobs-to-be-done, constraints, brand, metrics
2. ARCHITECTURE - Information architecture, user flows, component hierarchy, states
3. DESIGN SYSTEM - Tokens (color, spacing, typography, border, shadow, motion), primitives, patterns
4. COMPONENTS - Accessible, composable, documented, tested, versioned
5. SPECS - Developer handoff with states, responsive breakpoints, a11y, motion specs

EXPERTISE:
- Visual: hierarchy, grid, color theory, typography, iconography, motion, perception
- Interaction: affordances, feedback, states (hover/focus/active/disabled), gestures, keyboard, screen readers
- Systems: tokens, themes (light/dark), RTL, density scaling, versioning, migration
- Process: design reviews, usability testing, design QA, documentation, handoff
- Code: CSS architecture (cascade layers, container queries), component APIs, design tokens in code, Storybook

OUTPUT: JSON with tokens, components (name, props, states, a11y), patterns, screens, a11y, responsive, motion, handoff.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.ls", "pi.find", "pi.grep", "pi.bash"],
    outputSchema: {
      type: "object",
      properties: {
        tokens: { type: "object", description: "Color, spacing, typography, border, shadow, motion tokens" },
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              props: { type: "object" },
              states: { type: "array", items: { type: "string" } },
              a11y: { type: "array", items: { type: "string" } },
            },
          },
        },
        patterns: { type: "array", items: { type: "string" } },
        screens: { type: "array", items: { type: "object" } },
        a11y: { type: "array", items: { type: "string" } },
        responsive: { type: "object" },
        motion: { type: "object" },
        handoff: { type: "string" },
      },
      required: ["tokens", "components", "handoff"],
    }  },
  teammate: {
    systemPrompt: `You are a team lead orchestrating specialized analysts for deep project exploration.

METHODOLOGY:
1. SCOPE - Define analysis boundaries, entry points, and success criteria
2. DELEGATE - Spawn parallel analysts for each domain (frontend, backend, database, security, design, ui/ux, infra, api)
3. SYNTHESIZE - Collect individual markdown reports from dev-notes/teammate-analysis/
4. CONSOLIDATE - Cross-reference findings, identify dependencies, surface risks
5. DELIVER - Master index + actionable insights for fast correction & accurate decisions

ANALYSTS (each writes independent markdown):
- FRONTEND: Components, state management, routing, build, performance, accessibility
- BACKEND: API routes, services, auth, middleware, error handling, scaling patterns
- DATABASE: Schema, migrations, queries, indexes, transactions, RLS, backups
- SECURITY: AuthZ/AuthN, injection, secrets, crypto, dependencies, headers, CSP
- DESIGN: Tokens, components, patterns, screens, a11y, responsive, motion, handoff
- UI/UX: User flows, interactions, states, feedback, keyboard, screen readers
- INFRA: Build, deploy, CI/CD, environments, secrets, monitoring, logging
- API: Contracts, versioning, validation, rate limiting, docs, deprecation
- TESTING: Unit/integration/e2e coverage, strategies, fixtures, mocks, flakiness
- DEPENDENCIES: Graph, licenses, vulnerabilities, updates, bundling, tree-shaking

OUTPUT: JSON with analysts[], indexPath, crossCuttingConcerns[], risks[], quickWins[], architectureMap.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec", "pi.showImage"],
    outputSchema: {
      type: "object",
      properties: {
        analysts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              domain: { type: "string", enum: ["frontend", "backend", "database", "security", "design", "ui-ux", "infra", "api", "testing", "dependencies"] },
              reportPath: { type: "string" },
              summary: { type: "string" },
              findings: { type: "array", items: { type: "string" } },
              risks: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["domain", "reportPath", "summary", "confidence"],
          },
        },
        indexPath: { type: "string" },
        crossCuttingConcerns: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        quickWins: { type: "array", items: { type: "string" } },
        architectureMap: { type: "string" },
      },
      required: ["analysts", "indexPath", "crossCuttingConcerns", "risks", "quickWins", "architectureMap"],
    },
  },
  general: {
    systemPrompt: `You are a capable general-purpose assistant. Complete the task thoroughly and accurately.

APPROACH:
1. Clarify the task and success criteria
2. Use tools to gather facts before acting
3. Produce complete, verified output
4. Self-check against requirements before returning

OUTPUT: JSON with { result, confidence: 0-1, sources: [], nextSteps: [] }.`,
    allowedTools: ["pi.read", "pi.write", "pi.edit", "pi.bash", "pi.ls", "pi.find", "pi.grep", "pi.exec"],
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        sources: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
      },
      required: ["result", "confidence", "sources", "nextSteps"],
    },
  },
};

// ============================================================================
// Built-in Quality Gates
// ============================================================================

/** Check output is not empty or trivial. */
export const nonEmptyGate: QualityGate = (output) => {
  const trimmed = output.trim();
  if (!trimmed) return "Output is empty";
  if (trimmed.length < 10) return "Output is too short (likely incomplete)";
  return undefined;
};

/** Check output doesn't contain obvious hallucination markers. */
export const noHallucinationGate: QualityGate = (output) => {
  const hallucinationPatterns = [
    /TODO: implement/i,
    /FIXME: not implemented/i,
    /\[placeholder\]/i,
    /<your code here>/i,
    /implementation omitted/i,
    /left as an exercise/i,
    /not implemented/i,
    /coming soon/i,
  ];
  for (const pattern of hallucinationPatterns) {
    if (pattern.test(output)) {
      return `Output contains placeholder/hallucination marker: ${pattern.source}`;
    }
  }
  return undefined;
};

/** Check output validates against JSON schema if provided. */
export const schemaValidationGate: QualityGate = (output, schema) => {
  if (!schema) return undefined;
  try {
    const parsed = JSON.parse(output);
    // Basic schema validation (simplified - could use a real validator)
    if (schema.type === "object" && schema.properties) {
      for (const required of schema.required ?? []) {
        if (!(required in parsed)) {
          return `Schema validation failed: missing required field "${required}"`;
        }
      }
    }
    return undefined;
  } catch {
    return "Output is not valid JSON (schema validation requires JSON output)";
  }
};

/** Check output mentions specific files/lines (for code tasks). */
export const specificityGate: QualityGate = (output) => {
  const hasFileRef = /\.[a-z]{2,4}(:\d+)?/.test(output) || /\/[a-zA-Z0-9_.-]+\.[a-z]{2,4}/.test(output);
  const hasLineRef = /:\d+/.test(output);
  if (!hasFileRef && output.length > 200) {
    return "Output lacks specific file references (expected for code tasks)";
  }
  return undefined;
};

/** Check output has minimum viable content for the template type. */
export const completenessGate: QualityGate = (output, schema) => {
  if (!schema || !schema.properties) return undefined;
  try {
    const parsed = JSON.parse(output);
    // Check that array properties have at least one item (if they exist)
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type === "array" && parsed[key] && Array.isArray(parsed[key]) && parsed[key].length === 0) {
        return `Required array field "${key}" is empty`;
      }
    }
    return undefined;
  } catch {
    return undefined; // Let schemaValidationGate catch JSON errors
  }
};

// ============================================================================
// Enhanced Agent Runner
// ============================================================================

export class EnhancedAgentRunner {
  private baseRunner: AgentRunner;
  private costManager: CostManager;

  constructor(baseRunner: AgentRunner, activity?: ForgeryActivityStore) {
    this.baseRunner = baseRunner;
    this.costManager = createCostManager(activity);
  }

  /** Get the cost manager for external access */
  getCostManager(): CostManager {
    return this.costManager;
  }

  /** Run an enhanced agent with all quality improvements. */
  async runEnhanced(req: EnhancedAgentRunRequest): Promise<EnhancedAgentRunResult> {
    const startedAt = Date.now();
    const id = randomUUID();
    const maxRetries = req.maxRetries ?? 2;
    const template = req.template ? TEMPLATES[req.template] : TEMPLATES.general;

    // Build the complete system prompt
    const systemPrompt = this.#buildSystemPrompt(req, template);

    // Determine allowed tools
    const allowedTools = req.allowedTools ?? template.allowedTools;

    // Budget enforcement check before running
    if (req.budget && req.parentRunId) {
      const estimate = this.costManager.estimateCost(
        req.model ?? "default",
        req.task,
        req.template,
        0
      );
      const enforcement = withBudgetEnforcement(this.costManager, req.parentRunId, req.budget);
      const check = enforcement.checkBeforeRun(estimate.estimatedCost);
      if (!check.allowed) {
        return {
          id: randomUUID(),
          status: "failed",
          text: "",
          error: check.reason ?? "Budget exceeded",
          startedAt,
          finishedAt: Date.now(),
          attempts: 0,
          validationErrors: [check.reason ?? "Budget exceeded"],
        };
      }
      if (check.warning) {
        console.warn(`[CostManager] Budget warning: ${check.warning}`);
      }
    }

    // Build quality gates
    const qualityGates: QualityGate[] = [
      nonEmptyGate,
      noHallucinationGate,
      completenessGate,
      ...(req.outputSchema ? [schemaValidationGate] : []),
      ...(req.qualityGates ?? []),
    ];

    let lastOutput = req.previousOutput ?? "";
    let lastFeedback = req.previousFeedback ?? "";
    let attempts = 0;
    let validationErrors: string[] = [];
    let qualityGateFailures: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts = attempt + 1;

      // Build task prompt with context and feedback
      const taskPrompt = this.#buildTaskPrompt(req, template, lastOutput, lastFeedback, attempt > 0);

      // Run the base agent
      const baseResult = await this.baseRunner.run({
        task: taskPrompt,
        cwd: req.cwd,
        model: req.model,
        timeoutMs: req.timeoutMs,
        systemPrompt,
        name: req.name ?? `enhanced-${req.template ?? "general"}`,
      });

      // Record cost if usage available
      if (baseResult.usage && req.parentRunId) {
        const model = req.model ?? "default";
        const breakdown = this.costManager.calculateCost(
          model,
          baseResult.usage.input ?? 0,
          baseResult.usage.output ?? 0
        );
        this.costManager.recordAgentCost({
          agentId: baseResult.id,
          agentName: req.name ?? `enhanced-${req.template ?? "general"}`,
          template: req.template,
          model,
          breakdown,
          runId: req.parentRunId,
          phase: req.template,
        });
      }

      lastOutput = baseResult.text;

      // Validate output
      validationErrors = [];
      qualityGateFailures = [];

      // Run quality gates
      for (const gate of qualityGates) {
        const error = gate(lastOutput, req.outputSchema);
        if (error) {
          if (gate === schemaValidationGate) {
            validationErrors.push(error);
          } else {
            qualityGateFailures.push(error);
          }
        }
      }

      // If validation passes, try to parse structured output
      let structuredOutput: Record<string, unknown> | undefined;
      if (req.outputSchema && lastOutput) {
        try {
          structuredOutput = JSON.parse(lastOutput);
        } catch {
          validationErrors.push("Failed to parse output as JSON");
        }
      }

      // If all gates pass, we're done
      if (validationErrors.length === 0 && qualityGateFailures.length === 0) {
        return {
          ...baseResult,
          id,
          attempts,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
          qualityGateFailures: qualityGateFailures.length > 0 ? qualityGateFailures : undefined,
          structuredOutput,
        };
      }

      // Prepare feedback for next attempt
      lastFeedback = this.#buildFeedback(validationErrors, qualityGateFailures, req.outputSchema);
      
      // Log retry
      console.log(`[EnhancedAgent] Attempt ${attempts} failed, retrying...`, {
        validationErrors,
        qualityGateFailures,
      });
    }

    // All retries exhausted
    return {
      id,
      status: "failed",
      text: lastOutput,
      error: `Failed after ${attempts} attempts. Validation: ${validationErrors.join("; ")}. Quality: ${qualityGateFailures.join("; ")}`,
      startedAt,
      finishedAt: Date.now(),
      attempts,
      validationErrors,
      qualityGateFailures,
    };
  }

  /** Run multiple enhanced agents in parallel with shared context. */
  async runParallel(requests: EnhancedAgentRunRequest[]): Promise<EnhancedAgentRunResult[]> {
    return Promise.all(requests.map((r) => this.runEnhanced(r)));
  }

  /** Run a pipeline of enhanced agents (sequential, each passes context to next). */
  async runPipeline(steps: EnhancedAgentRunRequest[]): Promise<EnhancedAgentRunResult[]> {
    const results: EnhancedAgentRunResult[] = [];
    let accumulatedContext = "";

    for (const step of steps) {
      const req = {
        ...step,
        systemPrompt: (step.systemPrompt ?? "") + "\n\nPrevious step output:\n" + accumulatedContext,
      };
      const result = await this.runEnhanced(req);
      results.push(result);
      if (result.status === "completed" && result.text) {
        accumulatedContext += `\n\n--- Step ${results.length} (${step.template ?? "general"}) ---\n${result.text}`;
      }
      if (result.status !== "completed") break;
    }
    return results;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  #buildSystemPrompt(req: EnhancedAgentRunRequest, template: typeof TEMPLATES[AgentTemplate]): string {
    const parts: string[] = [];

    // Base template prompt
    if (template.systemPrompt) parts.push(template.systemPrompt);

    // Custom system prompt
    if (req.systemPrompt) parts.push(req.systemPrompt);

    // Output schema instruction
    if (req.outputSchema) {
      parts.push(`\nOUTPUT FORMAT: You MUST output valid JSON matching this schema:
${JSON.stringify(req.outputSchema, null, 2)}
Do not include any commentary, markdown, or text outside the JSON.`);
    }

    // Tool access instruction
    if (template.allowedTools.length > 0) {
      parts.push(`\nAVAILABLE TOOLS: ${template.allowedTools.join(", ")}
Use these tools to gather information and perform actions. Prefer reading over assuming.`);
    }

    // Context injection
    if (req.injectContext !== false && req.parentRunId) {
      parts.push(`\nCONTEXT: You are a sub-agent in a larger forgery_exec run (${req.parentRunId}).
The parent run has access to the full codebase. Use tools to explore as needed.`);
    }

    return parts.join("\n\n");
  }

  #buildTaskPrompt(
    req: EnhancedAgentRunRequest,
    template: typeof TEMPLATES[AgentTemplate],
    previousOutput: string,
    feedback: string,
    isRetry: boolean
  ): string {
    const parts: string[] = [];

    if (isRetry) {
      parts.push(`PREVIOUS ATTEMPT FAILED VALIDATION/QUALITY CHECKS.
FEEDBACK:
${feedback}

PREVIOUS OUTPUT:
${previousOutput.slice(0, 3000)}

Please correct the issues and try again. Output ONLY the corrected result.`);
    } else {
      parts.push(req.task);
    }

    // Add template-specific guidance
    const templateGuidance: Record<AgentTemplate, string> = {
      coder: "\nREMINDER: Write complete, working code. No placeholders. Run type-check/lint/build. Output JSON only.",
      researcher: "\nREMINDER: Cite specific files and line numbers. Distinguish facts from assumptions. Output JSON only.",
      reviewer: "\nREMINDER: Be specific with file:line references. Prioritize correctness > security > performance > style. Output JSON only.",
      planner: "\nREMINDER: Each task must be independently verifiable. Include estimates, deps, risks. Output JSON only.",
      tester: "\nREMINDER: Follow test pyramid. Test behavior not implementation. Output JSON only.",
      documenter: "\nREMINDER: Docs must be accurate, runnable, versioned. Output JSON only.",
      debugger: "\nREMINDER: Systematic 4-phase method. Falsifiable hypotheses. Output JSON only.",
      architect: "\nREMINDER: At least 3 alternatives with trade-off matrix. Document as ADR. Output JSON only.",
      security: "\nREMINDER: STRIDE threat model, OWASP Top 10, CWE mapping, CVSS exploitability. Output JSON only.",
      design: "\nREMINDER: Tokens → primitives → patterns → screens. Full a11y, responsive, motion specs. Output JSON only.",
      git: "\nREMINDER: Use gh CLI for all GitHub operations. Conventional commits. SemVer tags. Use worktrees for isolation: 'git worktree add ../repo-feature feature-branch' for parallel work. Clean up with 'git worktree remove' after merge. Output JSON only.",
      sniper: "\nREMINDER: Pixel-perfect analysis. Use pi.showImage for verification. SSIM/perceptual hash for regression. WCAG contrast. Design token extraction. Output JSON only.",
      teammate: "\nREMINDER: Spawn 10 parallel analysts. Each writes markdown to dev-notes/teammate-analysis/. Cross-reference findings. Master index for fast navigation. Output JSON only.",
      general: "\nREMINDER: Be thorough, accurate, cite sources. Output JSON only.",
    };
    
    if (req.template && templateGuidance[req.template]) {
      parts.push(templateGuidance[req.template]);
    }

    return parts.join("\n\n");
  }

  #buildFeedback(validationErrors: string[], qualityGateFailures: string[], schema?: OutputSchema): string {
    const parts: string[] = [];

    if (validationErrors.length > 0) {
      parts.push("VALIDATION ERRORS:");
      for (const e of validationErrors) parts.push(`  - ${e}`);
    }

    if (qualityGateFailures.length > 0) {
      parts.push("QUALITY GATE FAILURES:");
      for (const e of qualityGateFailures) parts.push(`  - ${e}`);
    }

    if (schema) {
      parts.push(`\nREQUIRED OUTPUT SCHEMA:
${JSON.stringify(schema, null, 2)}`);
    }

    return parts.join("\n");
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/** Create an enhanced agent runner wrapping the base runner. */
export function createEnhancedAgentRunner(baseRunner: AgentRunner): EnhancedAgentRunner {
  return new EnhancedAgentRunner(baseRunner);
}

// ============================================================================
// Convenience: Pre-configured agent runners for common tasks
// ============================================================================

export interface CoderAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  outputSchema?: OutputSchema;
  maxRetries?: number;
  parentRunId?: string;
}

export interface ResearcherAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

export interface ReviewerAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

export interface PlannerAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

export interface SecurityAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

export interface DesignAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

export interface GitAgentOptions {
  task: string;
  cwd?: string;
  model?: string;
  maxRetries?: number;
  parentRunId?: string;
}

/** Run a coder agent with sensible defaults. */
export async function runCoderAgent(
  runner: EnhancedAgentRunner,
  options: CoderAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "coder",
    outputSchema: options.outputSchema,
    name: "coder",
  });
}

/** Run a researcher agent with sensible defaults. */
export async function runResearcherAgent(
  runner: EnhancedAgentRunner,
  options: ResearcherAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "researcher",
    name: "researcher",
  });
}

/** Run a reviewer agent with sensible defaults. */
export async function runReviewerAgent(
  runner: EnhancedAgentRunner,
  options: ReviewerAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "reviewer",
    name: "reviewer",
  });
}

/** Run a planner agent with sensible defaults. */
export async function runPlannerAgent(
  runner: EnhancedAgentRunner,
  options: PlannerAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "planner",
    name: "planner",
  });
}

/** Run a security agent with sensible defaults. */
export async function runSecurityAgent(
  runner: EnhancedAgentRunner,
  options: SecurityAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "security",
    name: "security",
  });
}

/** Run a design agent with sensible defaults. */
export async function runDesignAgent(
  runner: EnhancedAgentRunner,
  options: DesignAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "design",
    name: "design",
  });
}

/** Run a git agent with sensible defaults. */
export async function runGitAgent(
  runner: EnhancedAgentRunner,
  options: GitAgentOptions
): Promise<EnhancedAgentRunResult> {
  return runner.runEnhanced({
    ...options,
    template: "git",
    name: "git",
  });
}

// Export internal constants for testing
/** @internal */
export { TEMPLATES };

// Export budget enforcement for testing
/** @internal */
export { withBudgetEnforcement };