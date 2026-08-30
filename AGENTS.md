# AGENTS.md — yxl-vscode

This is the **tool-agnostic contributor & AI-agent guide** for `yxl-vscode`
(Claude Code, Codex, Cursor, OpenCode, …). It is a **TypeScript** project: a
VS Code custom editor that renders a [`yxl`](https://github.com/t-ujiie-g/yxl)
spec (`*.yxl.yaml`) as a spreadsheet grid and translates grid edits back into
edits on the spec.

> `CLAUDE.md` is a **symlink to this file**, so Claude Code loads it
> automatically and there is exactly one guide to maintain. `ROADMAP.md` holds
> the project direction; this file holds *how we work*.

This project deliberately inherits `yxl`'s working conventions. Where a rule
below matches yxl's, that is on purpose; where it differs, `ROADMAP.md §7` says
why.

---

## 1. Single source of truth: ROADMAP.md

`ROADMAP.md` is the **single source of truth** for direction, phase scope, ADRs,
open questions, risks, and the living changelog. Before any non-trivial work you
MUST:

1. Read the active phase in `ROADMAP.md §6` (the first phase with an unchecked
   box).
2. Confirm the task is on that phase's checklist.
3. If it isn't, **stop and discuss scope** — do not silently widen it.

After completing work, **update `ROADMAP.md` in the same change**: tick the
box(es), add any newly discovered work to the right phase, append an ADR (§7) if
you made an architectural decision (never rewrite an accepted ADR — supersede
it), and add a §11 changelog entry for user-visible changes.

**"開発を進めて下さい" / "continue development"** = follow `ROADMAP.md §10`: find
the active phase, take the next unchecked item, implement it end-to-end, verify,
tick + changelog.

**Do not** create separate planning / decision / analysis docs. Everything goes
into `ROADMAP.md`.

*User-facing* documentation is the exception, and there are exactly two homes
for it here: `README.md` (what this is, install, what it can and cannot edit
yet) and the extension's marketplace description. The **spec format itself is
documented upstream** in yxl's `docs/spec.md` — never restate it here, link to
it. A second copy of the schema reference is a second thing to rot, and this
project already carries one second implementation (`ROADMAP.md` ADR-002) which
is one more than we want.

## 2. The upstream relationship

`yxl` is the compiler and the authority.

- **`docs/spec.md` in the yxl repo is the ceiling.** A spec this editor writes
  must compile with a stock `yxl build` on a machine that has never heard of this
  editor. If the GUI wants something the schema cannot say, the change belongs
  upstream — open it there, do not extend the schema locally (ADR-011).
- **Never guess a schema key.** Check `docs/spec.md` or yxl's `examples/`. This
  applies with double force here, because we are reimplementing part of yxl's
  loader and a guess becomes a silent divergence rather than a compile error.
- **`yxl build --check` is the validator of record** (ADR-011). Our loader
  validates only what projection requires.
- A local checkout of yxl is expected at `../yxl` for the differential test
  oracle (`ROADMAP.md` §5 Tier 3, ADR-012); the pinned version lives in one place
  in this repo.

## 3. Project structure

- A **pnpm workspace**. Packages under `packages/`, mapping one-to-one onto
  `ROADMAP.md §4.2`: `diag`, `units`, `cst`, `spec`, `loader`, `compile`,
  `intent`, `normalize`, `verify`, `patch`, `evaluate`, `webview`, `extension`.
- **Dependencies point downward.** A lower package never imports a higher one.
  The order is declared once in `layers.json` and enforced by
  `scripts/check-layers.mjs`, which runs as part of `pnpm lint`. Adding a
  package means adding it to `layers.json`, in its right position — the checker
  refuses a package it does not know, in both directions.
- **The core is I/O-free and UI-free** (ADR-004). Only `extension` may import
  `vscode` or touch the filesystem; only `webview` may touch the DOM. Two of
  those are enforced by the type checker rather than by the linter — node types
  are out of scope everywhere, and the DOM lib is configured only in
  `packages/webview/tsconfig.json` — so reaching for `document` or `process` in
  a core package is a compile error. Everything else takes its inputs as values
  and returns values. This is what makes the core testable on values alone.
- TypeScript **strict** everywhere. `any` needs a comment saying why, and that
  comment is one of the few that earns its place (§8.6).

## 4. Workflow

### Branching and releases
`main` is **protected — never commit or push to it directly.** Work on a branch
and open a pull request; CI must be green before merge.

```bash
git switch -c <kind>/<short-description>   # feat/, fix/, chore/, docs/, refactor/
# … work, commit …
git push -u origin HEAD
gh pr create --fill
```

**A tag is the release.** Pushing `v<major>.<minor>.<patch>` publishes to the
Marketplace with nobody in the loop — the guards are mechanical, and ADR-052 says
why there is no approval step. What a release needs from you, in order:

1. **Raise the version** in `packages/extension/package.json` — the tag must
   equal it or the workflow refuses.
2. **Write the `packages/extension/CHANGELOG.md` section** for that version, and
   **name the yxl it targets** in both that file and the package's `README.md`.
   `tests/manifest.test.ts` fails when either stops matching the pin, and
   `release.yml` fails when the changelog has no section for the version — it is
   the release notes.
3. **Merge it**, then tag `main` and push the tag:

```bash
git switch main && git pull
git tag v0.1.0 && git push origin v0.1.0
```

`release.yml` then runs the same checks a pull request runs, holds the tag
against the manifest, builds one `.vsix` and attests it, publishes *that
artefact* to the Marketplace, and writes the GitHub release. Re-running is safe:
`--skip-duplicate` means a version already on the Marketplace is not an error, so
deleting the tag and pushing it again recovers a failed run.

Publishing needs `VSCE_PAT` in the `marketplace` environment, which hands it to
`v*` tags alone. **The token is a global Azure DevOps PAT, and those are retired
on 2026-12-01** — ADR-052 records the successor and what it costs.

### Before starting
1. Read the relevant `ROADMAP.md` phase and any ADR you're about to touch.
2. If the task isn't in the active phase, confirm with the user first.
3. Track multi-step work (TaskCreate / TaskUpdate).

### While working
- Run `pnpm typecheck` after every meaningful edit — fast, catches most mistakes.
- **Verify an API rather than recalling it.** Read the dependency's `.d.ts` in
  `node_modules`, or its docs. This matters most for `eemeli/yaml`'s CST layer
  and `@univerjs/engine-formula`, whose surfaces are large and versioned. Never
  present a guessed API as fact.
- **Verify a licence before adding a dependency**, from the registry or the
  package's own `LICENSE` — not from memory. Licence is a first-class selection
  criterion here (ADR-013), and an ADR in `ROADMAP.md §7` is required for any new
  runtime dependency.
- Edit existing files; don't create new files unless a `ROADMAP.md` task or the
  user asks.
- **Comments are written to §8.6's rules, not cleaned up to them later.** The
  short form, for the moment of writing:
  - **Default: none.** Before writing one, try a better name or a smaller
    function first. If the code then says it, there is nothing to write.
  - **An export gets a doc comment** — what it *is*, in one to three lines, plus
    at most one pointer to where the rule lives (`docs/spec.md §n`, `ADR-nnn`).
    Not why it exists, not how it came to be, not what it used to do.
  - **Everything else gets one line or nothing.** A private function whose name
    says it gets nothing. An inline comment is one or two lines, only for a
    constraint the code cannot show, and sits **above the statement** — never
    inside an object literal, an argument list, or between the halves of an
    expression, and never twice on one declaration.
  - **The story goes in the commit and the PR**, where it belongs and is read
    once. Rationale, the bug that led here, the trade-off you weighed: PR body.
    A comment that starts "because" or "which is why" is a paragraph of PR prose
    that has landed in the source, and it will still be there when the reason
    is gone.
  - Before committing, `node scripts/comment-shape.mjs --totals` should not have
    moved up. If it did, read the new entries in the full report.

### Before reporting complete — validation loop
```bash
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # vitest, all tiers that run locally
pnpm lint             # includes the dependency-direction check
pnpm build            # the extension actually bundles
```

## 5. Commands reference

| Purpose | Command |
|---|---|
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Single test file | `pnpm test <path>` |
| Watch tests | `pnpm test --watch` |
| Lint (includes the layer check) | `pnpm lint` |
| Format and apply safe fixes | `pnpm format` |
| Layer check alone | `node scripts/check-layers.mjs` |
| Comment shape report (§8.6) | `node scripts/comment-shape.mjs` — every comment over the limit, longest first; `--totals` for the counts |
| Rewrite the README's schema-coverage table (§8.5) | `COVERAGE=write pnpm test tests/coverage.test.ts` — the table is written from `spec/coverage.ts`, and the same test fails when the README is stale |
| Build | `pnpm build` |
| Build the `.vsix` | `pnpm package` in `packages/extension` — writes `yxl-vscode-<version>.vsix` |
| Release it | tag `main` `v<version>` and push the tag (§4) |
| Get the conformance oracle | install the **pinned** `yxl` release, or point `YXL_BIN` at it (`ROADMAP.md` ADR-018) |
| Run the extension | **F5** in VS Code — *Run the preview*, which builds first |
| Run it on yxl's cookbook | **F5** with *Run the preview on yxl's own examples* |

F5 builds both bundles and opens an Extension Development Host; in that window,
open a `*.yxl.yaml` and run **yxl: Open the Grid Beside the Spec**. Without VS Code's
debugger — from a terminal, say — the same thing is
`code --extensionDevelopmentPath=packages/extension <a folder of specs>`.

**Published** as `t-ujiie-g.yxl-vscode` since 0.1.0 (2026-08-30). A `v*` tag is
what publishes it — see §4, and ADR-052 for the shape of the workflow. Nothing
else can: `VSCE_PAT` belongs to the `marketplace` environment under a `v*` rule,
so no branch and no pull request can reach it.

## 6. Testing conventions

The five tiers are defined in `ROADMAP.md §5`. What they mean day to day:

- **Every exported function gets ≥1 direct test; every error path is covered.**
- **The core tests on values.** No filesystem, no `vscode` mock, no DOM. If a
  test in `compile` needs a file, the design is wrong, not the test.
- **CST fidelity is a hard gate** (Tier 2). Parse → serialize with no patch is
  byte-identical. Any change to `cst` or `patch` runs this over the full corpus.
  A patch's test asserts *which lines moved*, not just that the result parses.
- **The differential oracle is not optional** (Tier 3, ADR-012). Any change to
  `loader` or `spec` runs the corpus comparison against the MoonBit
  implementation. A disagreement is a failure even when our answer looks better —
  if ours is genuinely better, the fix goes upstream first.
- **Assert on values, not shapes.** `toEqual` over `toBeTruthy`. Snapshots are
  for genuinely large structured output (a compiled grid), never for a value you
  could name.
- **A test that only re-runs the typechecker is not a test** — delete it.
- Fixtures live with the package that owns them; the shared corpus (yxl's
  `examples/` plus our awkward-YAML set) is referenced, not copied.

## 7. Project-specific conventions

These override generic TypeScript practice. Rationale lives in the
`ROADMAP.md §7` ADRs.

- **The grid is a projection.** No UI component holds cell state, and no code
  path mutates a `CompiledGrid`. A gesture produces an `EditIntent`; the AST
  changes; the grid is recomputed. (ADR-001)
- **Never infer which spec the user meant.** Ambiguity is enumerated and asked,
  or it is refused with a reason. A heuristic that picks for the user is the one
  change most likely to be rejected in review. (ADR-001)
- **Every write passes `verify`, and every style write passes `normalize`.**
  There is no fast path, no "this one is obviously safe", and no bypass for
  internal callers. (ADR-008, ADR-009)
- **Nothing evaluated is ever written.** A computed value is display-only and
  unreachable from any write path. (ADR-014)
- **Preserve what we don't model.** Valid-but-unmodeled constructs pass through
  the CST untouched and are marked opaque — never dropped, never reformatted.
  (ADR-011)
- **No editor metadata in the spec.** No ids, no private keys, no sidecar file a
  spec stops working without. (ADR-015)
- **Type-safe boundaries.** Branded types for A1 addresses, ranges, sheet names,
  colours, node ids. Parse once at the edge; inside, a `string` that is really an
  address is a bug waiting for a caller to swap two arguments.
- **Errors are typed and carry a span.** Subdomain error types with a `diag`
  span, never a bare `throw new Error(string)`, and never a message assembled at
  the throw site — `diag` owns how a user-visible message reads.

## 8. Refactoring checklist

When the user says **"リファクタリング" / "refactor" / "tidy up" / "clean up"**,
walk these lenses **in order**, writing a concrete findings list **before**
changing code. Applies whether the trigger is one file or the whole tree.

### 8.1 Constants management
Promote magic numbers and repeated string literals that name a concept to a
named export in the owning package. Domain constants (schema key names, default
column widths, the style-distance threshold, diagnostic codes) are defined
exactly once and reused. A literal that appears in two packages belongs to the
lower one.

### 8.2 Duplicate / dead code
Consolidate identical helpers to one location and re-export. Delete scaffolding
files that hold no real API. Delete smoke tests superseded by real ones. Drop
unused imports and exports. Make exported functions with no external caller
module-private, or delete them. An `export` that exists only for a test is a
design smell — test through the public surface, or move the seam.

### 8.3 File splitting
A module over ~500 lines is a *smell*, not a rule — split only at a **logical**
boundary (the resolution table for values vs. for styles vs. for structure),
never to hit a line count. One test file per source file is a good default.

### 8.4 Test adequacy
Every exported function has ≥1 positive test; every error path is covered; Tier 2
byte-identity and Tier 3 conformance still pass; tests assert on values rather
than shapes. A new resolution row in `ROADMAP.md §4.4` has its own test — the
table and the test suite are the same list.

### 8.5 Documentation freshness
`ROADMAP.md §6` checkboxes match actual code state; §11 has an entry for this
change. Exported APIs have doc comments. ADRs supersede rather than mutate. The
README's "what is editable today" table matches reality.

### 8.6 Comment hygiene
**The default is no comment.** A comment is justified only when a reader of the
code *cannot* recover the intent from the code itself; write one there and
nowhere else. Every comment is a line that can go stale independently of the
thing it describes, so each one has to earn its keep. Comments must also make
sense to someone who never read `ROADMAP.md` and wasn't there when the code
landed.

Apply these in order — the first three delete, the last one keeps:

- **Delete what the code already says.** If the comment is a paraphrase of the
  line, the block, or the function name below it, it carries nothing: delete it,
  and if the code really was unreadable, fix the *code* — a better name, a named
  intermediate, a smaller function — rather than annotating it.
- **Delete documentation that wandered into the source.** Schema semantics, the
  rationale for a design, the tour of how a package fits together: that is
  `ROADMAP.md`, an ADR, `README.md`, or yxl's `docs/spec.md`. Written in both
  places it is duplicated, and the copy in the source is the one that rots. Say
  it once, in the doc; the source may point at it (`ADR-009`,
  `docs/spec.md §10`) but must not restate it. File-header essays and section
  banners (`// ---- helpers ----`) are this failure mode — delete them; the file
  name already names the subject.
- **Delete narration of the past.** What used to happen, what a commit changed,
  why a reviewer should be convinced — noise once merged. If a *bug* is the
  reason for a non-obvious line, keep the reason and cite the issue (`#52`) in
  one clause; drop the story.
- **Keep the constraint the code can't show** — a YAML spec rule, an invariant
  the types don't enforce, a deliberate deviation from a library's documented
  behaviour, a *why* that is genuinely surprising. One or two lines, at the line
  it governs. Doc comments on exported APIs stay mandatory: they are API
  documentation, not commentary, and are exempt from the delete rules above.
- **No roadmap/phase codes in comments** (`Phase 3`, `roadmap §6.2`) — name the
  *thing* instead ("the style normalizer", "the trailing-comment workaround").
  ADR-nnn and issue #N references are fine — they're stable and findable.

**Shape.** The rules above say *what*; these say *how much*, so that a pass can
be measured rather than felt. A doc comment on an export is **one to three lines
of text**: what it is, and at most one pointer to where the rule lives. A doc
comment on anything private is **one line**, or absent where the name already
says it. An inline comment is **one or two lines**. Longer is not forbidden — a
`Removal` type with two variants may need four — but every block over the limit
is a line in `node scripts/comment-shape.mjs`, and a refactoring pass reads
that list first and either keeps each entry for a reason or cuts it. The
`--totals` line is the number to watch across a phase: the averages should not
climb.

**Placement.** A comment sits above the statement it governs, at that
statement's indentation. Never inside an object literal above one field, never
inside an argument list, never between the halves of a ternary or a chained
condition — a reader scanning the shape of a call must not have to step over
prose to see its arguments. Never two doc comments on one declaration; if the
second says something the first does not, fold it in. Never a floating comment
attached to nothing.

**The channel that produces most of the excess** is worth naming: writing PR
prose into the source. The rationale, the trade-off, the bug that led here are
all worth writing — in the commit message and the PR body, where they are read
once by the people deciding, and stay findable by `git blame`. A comment that
opens "because", "which is why", "so that", or "rather than" is usually that
paragraph having landed in the wrong place. Move it, do not shorten it.

**Interface fields carry no doc comment of their own.** Annotating some fields
and not others is the worst case: the reader can no longer scan the type at all.
Say what a field needs said in the **type's own doc**, in one place, and leave
the field list bare. Conventions that hold across the whole type — "`null` means
the layer contributed nothing" — are stated once there, never per field.

Union members are the exception, and a narrow one: a one-word discriminant can
genuinely fail to say what it selects, so a single line naming the spec construct
it comes from earns its place. Two lines does not.

Tests are code and get the same treatment. A test's name says what it asserts; a
comment restating that is noise. Keep only the surprising *why* — why this value
and not the obvious one, which past defect the case pins down — in one line.
Test-file header essays go the way of source-file ones: the `describe` names are
the table of contents.

### 8.7 Layer discipline
The lens this project has that yxl does not. Check that the refactor did not blur
`ROADMAP.md §4.1`:

- Does any package import upward? (CI checks; check the *intent* too — a type
  imported from a higher layer "just for convenience" is the first step.)
- Did grid state appear anywhere outside the projection? (ADR-001)
- Did a write path acquire a way around `verify` or `normalize`? (ADR-008/009)
- Did `vscode`, `node:fs`, or the DOM reach a core package? (ADR-004)
- Did an evaluated value become reachable from a write? (ADR-014)

### 8.8 Validation loop after refactoring
```bash
node scripts/comment-shape.mjs --totals   # not up on the last pass (§8.6)
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Push only when all are clean, and record the comment-shape totals in the
`ROADMAP.md §11` entry for the pass, so the next pass has a number to hold to.

### 8.9 Dependency and toolchain currency
- **Clear deprecation warnings** rather than suppressing them.
- **Re-verify against ground truth, not memory** — read the `.d.ts` in
  `node_modules`, not what the API used to be.
- Re-run the **Tier 3 oracle after any `yxl` version bump**; the schema is not
  frozen until yxl's v1.0, and a bump is exactly when drift appears.
- Land a lockfile or toolchain bump as its own commit so it stays reviewable.

## 9. Things to avoid

- ❌ Planning/decision docs outside `ROADMAP.md`.
- ❌ Adding a dependency without an ADR in `ROADMAP.md §7`, or without checking
  its licence at the registry.
- ❌ Extending the spec schema locally instead of upstream in `yxl`.
- ❌ Guessing a schema key, or inferring which spec the user meant.
- ❌ Dropping or reformatting a construct we don't model.
- ❌ Writing an evaluated value back to the spec.
- ❌ A write path that bypasses `verify` or `normalize`.
- ❌ `vscode` / `node:fs` / DOM access in a core package.
- ❌ Bare `string` for A1 refs, sheet names, colours, or node ids in internal
  APIs.
- ❌ Comments that restate the code, or documentation duplicated from
  `ROADMAP.md` / yxl's `docs/spec.md` into source comments (see §8.6).
- ❌ Restating yxl's spec reference in this repo.

## 10. When in doubt

- **The spec format:** yxl's `docs/spec.md` and `examples/` are ground truth.
  Never present a guessed key as fact.
- **A library's API:** read its `.d.ts` in `node_modules`. Especially
  `eemeli/yaml` — the CST layer and the Document layer are different APIs with
  different guarantees, and we deliberately use the lower one (ADR-003).
- **Project direction:** re-read the relevant `ROADMAP.md` phase; if unclear,
  ask the user.
- **Whether an edit is ambiguous:** if you are unsure, it is. Enumerate and ask.
  That is the product working, not the product failing.
