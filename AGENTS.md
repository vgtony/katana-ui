# AGENTS.md

## Scope

This repository is worked on by a single coding agent in Antigravity IDE using ChatGPT 5.4.

The agent should optimize for:

- correctness,
- minimal and targeted changes,
- clear reasoning,
- explicit verification,
- maintainable code.

Do not assume multi-agent coordination, shared memory systems, or external orchestration tools.

---

## Working Style

- Prefer the narrowest correct change over broad refactors.
- Preserve existing architecture, naming, and conventions unless the task requires change.
- Fix root causes, not symptoms.
- Do not introduce new dependencies unless they are necessary and justified.
- Do not claim success without verification or an explicit statement that the result is unverified.

---

## Repo Awareness

Before editing:

- inspect the relevant files and nearby code paths,
- infer local conventions from the codebase,
- prefer consistency with the existing implementation over stylistic reinvention.

When the codebase already has a clear pattern, follow it.

---

## Planning

Use a plan only when the task is non-trivial, ambiguous, or spans multiple files.

Plans should be short and operational:

- goal,
- affected files or subsystems,
- intended approach,
- verification path.

Do not create planning overhead for small localized edits.

---

## Editing Rules

- Prefer direct fixes over speculative cleanup.
- Avoid unrelated refactors.
- Keep diffs easy to review.
- Update comments or docs only when they are affected by the change.
- Do not leave dead code or misleading TODOs behind.

When changing behavior:

- update the implementation,
- update any tests that encode the old behavior,
- update docs only if user-facing or developer-facing behavior changed.

---

## Verification

After editing, run the smallest meaningful verification first, then broader checks if needed.

Examples:

- targeted test for the changed module,
- lint for the changed surface,
- typecheck,
- build,
- broader test suite only when justified.

When reporting results, distinguish clearly between:

- commands actually run,
- commands not run,
- inferred outcomes,
- unresolved risks.

Do not treat static inspection as equivalent to runtime verification when runtime behavior is the issue.

---

## Live-State Rule

Distinguish clearly between:

- code changed on disk,
- code active in a running process.

If a restart, rebuild, migration, cache clear, or re-run is required for the change to take effect, say so explicitly.

Do not describe a fix as active until the required live-state transition has happened.

---

## Escalation Rule

If repeated small patches do not improve the relevant verification signal:

- stop repeating the same patch pattern,
- name the failing assumption,
- prefer a more decisive scoped refactor,
- explain why the previous approach is no longer the best path.

Do not spend multiple iterations on low-value micro-tweaks once the failure pattern is clear.

---

## Version Control

Use Git and GitHub for version control.

Preferred workflow:

- inspect changes with `git status` and `git diff`,
- create focused commits with clear messages,
- avoid bundling unrelated changes into one commit,
- use branches or the repository’s standard workflow when appropriate,
- do not rewrite shared history unless explicitly requested.

If the user asks for version-control help, prefer Git commands and GitHub-oriented workflows.

---

## Frontend-Specific Guidance

For frontend work:

- preserve component boundaries unless there is a clear design problem,
- keep presentational and stateful concerns reasonably separated,
- handle loading, empty, error, and success states explicitly,
- avoid unnecessary prop drilling when an existing local pattern solves it,
- do not introduce new state-management or styling libraries without strong justification,
- preserve accessibility and keyboard behavior,
- avoid silent fallbacks that hide broken UI behavior.

When modifying UI:

- keep responsive behavior in mind,
- preserve semantic HTML where possible,
- avoid breaking tests, snapshots, or visual assumptions without reason.

---

## Communication Style

For non-trivial tasks, end with a concise summary covering:

1. what changed,
2. which files changed,
3. what was verified,
4. any open risks, blockers, or next steps.

If no changes were made, state the best current conclusion and the next recommended action.

Be explicit about uncertainty. Do not imply verification that did not happen.

---

## Avoid

- broad rewrites without need,
- speculative dependency additions,
- hidden behavior changes,
- fallback behavior that masks a broken contract,
- claiming completion without verification,
- creating process overhead that does not help a single-agent workflow.
