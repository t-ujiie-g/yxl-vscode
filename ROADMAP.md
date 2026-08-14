# ROADMAP.md — yxl-vscode

> **This file is the single source of truth** for direction, phase scope,
> architecture decisions (ADRs), open questions, risks, and the living
> changelog. Every change that touches scope, design, or status also touches
> this file (see `AGENTS.md §1`). Contributor & agent *workflow* lives in
> `AGENTS.md`; *direction* lives here.
>
> This project is downstream of [`yxl`](https://github.com/t-ujiie-g/yxl) and
> deliberately inherits its stance. Where a rule here restates one of yxl's, it
> cites the yxl ADR it comes from; where it *departs*, the departure is an ADR of
> its own with the reason written down.

---

## 1. Vision

`yxl` made a workbook into text. This makes that text **direct-manipulable**
without giving up any of what made it text.

`yxl-vscode` is a **custom editor for `*.yxl.yaml` specs**: it renders the spec
as a spreadsheet grid, and translates grid gestures back into edits on the
spec — not into a workbook. You click a cell and type; the file that changes is
the YAML, in the smallest diff that expresses what you did, with your comments,
key order, and formatting intact.

The premise in one line:

> **The grid is not the document. The grid is a projection of the document.**

Everything below follows from that. A projection is computed forward
deterministically (spec → grid). It cannot be inverted by computation, because
many specs project to the same grid — a bold cell might be bold because the cell
says so, because its column band says so, or because a named style forty other
cells share says so. So the editor never *guesses* which one you meant. Where the
inverse is unique it applies it silently; where it is not, it asks, and it shows
you the blast radius of each answer before you pick.

That discipline is what earns the real goal:

- **AI writes YAML. A human clicks cells. Both converge on the same clean
  spec.** An agent following `skills/yxl-authoring` and a person dragging a fill
  colour produce specs that are indistinguishable in structure, because every
  GUI write passes the same style normalizer and the same verification loop.
- **The spec never degrades.** Untouched bytes stay byte-identical. A GUI
  session cannot silently inline forty copies of something the spec declared
  once — that would undo yxl's entire reason for existing (yxl ADR-004).
- **Excel remains the renderer of record.** The grid is for authoring and
  review; `yxl build` still produces the `.xlsx`, and Excel still computes.

### Who this is for

The person who adopted `yxl`, likes what Git now does for their workbooks, and
does not want to hand-write `at: E2:E500` to shade a total row. And the person
who has not adopted it, because "edit YAML" was the answer and it was the wrong
one for them.

### What it is not

It is not a spreadsheet application with a YAML export. That product exists many
times over and is a different thing: there the workbook is the truth and the text
is a artifact. Here the text is the truth and the grid is the artifact. Every
design call in this document resolves that way.

## 2. Non-goals

Inherited from `yxl` unchanged:

- **Formula evaluation as semantics.** Excel computes; we may *display* a
  computed preview (§6 Phase 5, ADR-013), but a value we evaluate is never
  written to the spec and never treated as truth. A disagreement between our
  preview and Excel is our bug, not a spec change.
- **Macros / VBA.**
- **Continuous `.xlsx` ⇄ YAML round-tripping.** We do not import edits made in
  Excel back into the spec. `yxl extract` remains the one-way, one-time bridge.
  If a user is editing the workbook in Excel, this editor is not what they need.
- **Being a general spreadsheet library.**

New to this project:

- **Not a second spec language.** `docs/spec.md` in the yxl repo is the ceiling.
  If the GUI wants to express something the schema cannot, the answer is a
  schema change *upstream in yxl*, never a GUI-only extension. A spec this
  editor writes must compile with a stock `yxl build`, on a machine that has
  never heard of this editor. (ADR-011)
- **Not a validator of record.** `yxl build --check` is. We validate exactly as
  much as projection requires, and defer the rest. (ADR-011)
- **Not an inference engine.** No heuristic ever decides which of several
  possible specs the user meant. Ambiguity is surfaced as a choice, or it is not
  resolved at all. (ADR-001)
- **No editor-only metadata in the spec.** No node ids, no `x-yxl-vscode:` keys,
  no sidecar lockfile that a spec stops working without. The moment a spec
  carries tool exhaust it stops being ordinary YAML, which was the whole
  proposition. (ADR-015)
- **Not a co-editing / multiplayer surface.** One file, one editor, ordinary
  file-change detection (§8 Q3).

## 3. Design principles

1. **The grid is a projection.** `compile: SpecDoc → Grid` is pure,
   deterministic, and total. Nothing in the UI mutates the grid; the UI proposes
   AST operations and re-projects. (ADR-001)
2. **Write-back is resolution, never inversion.** `Grid → SpecDoc` is not a
   function. The Intent Resolver enumerates the pre-images and lets the user pick
   one; a single candidate applies silently, several ask, zero is read-only with
   a stated reason. (ADR-001, ADR-006)
3. **Provenance is per-facet, not per-cell.** A cell's value, number format, and
   each individual style property can each come from a different construct.
   Anything coarser collapses under the first real spec. (ADR-005)
4. **Every write is verified before it lands.** Compile before, compile after,
   diff the grids, and refuse or confirm anything that changed a cell the intent
   did not name. Applies to GUI edits and LLM proposals identically. (ADR-009)
5. **Untouched bytes stay untouched.** Serialization is a minimal patch over the
   CST, not a re-print. A no-op edit is byte-identical, and that is a test.
   (ADR-003)
6. **The spec gets no worse.** Every write passes the style normalizer, which
   prefers referencing an existing definition over creating a new one, and
   extending over forking. Without it a GUI is a machine for producing
   forty anonymous styles. (ADR-008)
7. **Fail fast, explain well.** Invalid input is a diagnostic with file and
   position, never a silent drop or a guess. (yxl ADR-006)
8. **Core is I/O-free and UI-free.** `cst` / `spec` / `loader` / `compile` /
   `intent` / `normalize` / `verify` touch neither the filesystem nor the VS Code
   API nor the DOM. That is what makes them testable, and what makes a Tauri or
   browser shell a packaging exercise later rather than a rewrite. (ADR-004,
   after yxl ADR-003)
9. **Type-safe boundaries.** No bare `string` for A1 addresses, sheet names,
   colours, or node ids in internal APIs. Branded types, parsed once at the edge.
   (yxl design principle 6)
10. **Parity with yxl is measured, not promised.** We reimplement part of yxl's
    loader in TypeScript; the only honest way to hold that is to test both
    against each other on every commit. (ADR-012)

## 4. Architecture

### 4.1 The layer stack

```
┌──────────────────────────────────────────────┐
│ L5  Assistant        proposals only, never applies directly
├──────────────────────────────────────────────┤
│ L4  Intent Resolver  gesture → candidate patches → user choice
├──────────────────────────────────────────────┤
│ L3  Grid+Provenance  disposable projection; what the UI draws
├──────────────────────────────────────────────┤
│ L2  Compiler         SpecDoc → Grid. pure, deterministic
├──────────────────────────────────────────────┤
│ L1  SpecDoc (AST)    ★ the truth ★  patches apply here
├──────────────────────────────────────────────┤
│ L0  CST              YAML bytes ⇄ AST, minimal patch, spans
└──────────────────────────────────────────────┘
```

The asymmetry between L1→L3 (a function) and L3→L1 (not a function) is the
entire reason L4 exists. See ADR-001.

### 4.2 Package map

A pnpm workspace. Dependencies point **downward**; a lower package never imports
a higher one. The rows below are in dependency order, and that order is
**declared once in `layers.json` and enforced in CI** by `scripts/check-layers.mjs`
(§5) — the table is the explanation, the file is the rule.

| Package | Layer | Purpose |
|---|---|---|
| `diag` | — | Diagnostics, severities, source spans (file/line/col). The one place a user-visible message is shaped. |
| `units` | — | Branded types: `A1Addr`, `A1Range`, `SheetName`, `Color`, `NodeId`, dimensions. Parse at the edge, pass typed inside. |
| `cst` | L0 | `eemeli/yaml` behind our own seam: source → span-carrying tree; apply an op list as a minimal byte patch. The *only* package that knows YAML syntax exists. (ADR-003) |
| `spec` | L1 | The `SpecDoc` AST — the TypeScript shape of `docs/spec.md`. Types and constructors only, no logic. |
| `loader` | L1 | CST tree → `SpecDoc`, with the validation projection requires. Preserves unmodeled-but-valid constructs verbatim. (ADR-011) |
| `compile` | L2/L3 | `SpecDoc` → `CompiledGrid` + per-facet provenance and style layers. Pure and deterministic; the workhorse. (ADR-005) |
| `normalize` | L4 | The style normalizer: an applied style becomes a reference, an `extends:`, or a new definition — in that order of preference. (ADR-008) |
| `patch` | L0/L1 | `Patch` → `cst` ops, and the inverse patch that makes undo AST-level. (ADR-010) |
| `verify` | L4 | The double-compile diff gate every patch passes. (ADR-009) |
| `evaluate` | — | Formula evaluation behind a seam; display only, never written back. (ADR-013) |
| `intent` | L4 | `EditIntent` → `Resolution[]` → `Patch`. Holds the resolution table (§4.4) and the impact estimator. Sits highest of the core packages, because resolving needs all of them. |
| `webview` | UI | The grid, the inspector, the resolution dialog. The only package that renders. |
| `extension` | edge | VS Code custom editor registration, filesystem, `yxl` CLI invocation, settings. The only package that imports `vscode`. |

`extension` and `webview` are replaceable — a Tauri shell swaps both and keeps
everything above (§8 Q8). Nothing below them may know which shell it is in.

### 4.3 Provenance — the shape that makes the rest work

Compilation records, for every cell, *where each facet came from*:

```ts
interface CellProvenance {
  addr:   FullAddr;
  value:  FacetOrigin;
  format: FacetOrigin | null;
  style:  StyleLayer[];          // stacked bottom-up; each layer names only
}                                // the properties it contributed

type FacetOrigin =
  | { kind: 'literal';      node: NodeId }
  | { kind: 'inline';       node: NodeId; row: number; col: number }
  | { kind: 'external';     node: NodeId; file: FilePath; row: number; col: number }
  | { kind: 'formulaRange'; node: NodeId; anchor: A1Addr; offset: [number, number] }
  | { kind: 'defRef';       node: NodeId; def: NodeId }
  | { kind: 'param';        node: NodeId; template: string; params: ParamName[] }
  | { kind: 'override';     node: NodeId }
  | { kind: 'empty' };
```

Keeping `style` as a **layer list** rather than a resolved blob is what lets the
inspector answer "this is bold because `defs.styles.header` says so, and blue
because column B's band says so" — and lets the resolver generate one candidate
per layer without inventing anything. (ADR-005)

Each origin carries an **editability class**, and that class alone drives the UI:

| Class | Origins | Behaviour |
|---|---|---|
| `direct` | `literal`, `inline`, `override` | Edit applies immediately |
| `mediated` | `defRef`, `param`, `formulaRange`, band-supplied style | Edit opens the resolution dialog |
| `external` | `external` (CSV/JSON) | Edit the companion file, or divert to `overrides:` |
| `readonly` | `empty` in a sealed region, evaluated results | Refused, with the reason in a tooltip |

### 4.4 The resolution table

This is the specification of L4, not an illustration of it. Phase 7 implements it
row by row, one test per row.

**`setValue`**

| Origin | Candidates |
|---|---|
| `literal` | rewrite that node *(auto)* |
| `inline` | rewrite `data[i].values[r][c]` *(auto)* |
| `external` | ① write the CSV/JSON cell ② add to `overrides:` ③ cancel |
| `param` | ① change the parameter default *(show the ripple count)* ② add to `overrides:` |
| `defRef` | ① change the definition *(ripples to N)* ② detach this cell to a literal |
| `formulaRange` | ① change the range's formula ② split the range so this row stands alone ③ `overrides:` |
| `empty` | ① new `cells:` entry ② extend the adjacent `data:` rectangle, when there is one |

**`setStyle`** — the branchiest, and the one that decides whether the product
feels good:

```
1. collect StyleLayer[] for every cell in the range
2. for each property in the patch, find the layer currently supplying it
3. per supplying layer, emit a candidate:
     namedStyle → ① edit the definition (ripples to N)
                  ② derive a variant for this range   → normalizer (ADR-008)
     band       → ① edit the column/row band (whole column)
                  ② pin it on the cells instead
     nobody     → ① set it inline                     → normalizer (ADR-008)
4. if origins are mixed across the range, offer "apply to all" and
   "split by origin" rather than picking for the user
```

**`insertRow` / `insertCol`** — enumerate consequences *before* running:
`cells:` A1 keys shift (this is what bloats a diff), `data:` rectangles gain a
blank row or move, `formulas:` ranges extend or move, `merges:`/`tables:`/charts
follow. Show the expected YAML diff size, and when `cells:` is what is bloating
it, offer the `data:` conversion instead (this is the yxl Phase 11
diff-stability work, surfaced at the moment it matters).

### 4.5 Patch

```ts
type Patch = { ops: Op[]; intent: EditIntent; expectedDiff: ExpectedDiff };
```

Ops address the AST by path (`set`, `delete`, `insertItem`, `removeItem`,
`renameKey`, `rekeyMap` for bulk A1 shifts) or address a companion file
(`csvSet`, `csvInsertRow`). Every op has an inverse, so undo/redo is AST-level
and stays coherent when GUI edits and hand edits to the same file interleave.
(ADR-010)

`expectedDiff` is what §4.6 checks against — it is the patch's own claim about
what it is allowed to change.

### 4.6 The verification loop

```ts
function verify(doc: SpecDoc, patch: Patch): VerifyResult {
  const before = compile(doc);
  const after  = compile(applyPatch(doc, patch));   // in memory; nothing written
  if (after.diagnostics.some(isError)) return { ok: false, ... };
  const surprises = diffGrids(before, after).filter(c => !patch.expectedDiff.covers(c));
  return surprises.length ? { ok: 'confirm', surprises } : { ok: true };
}
```

Three modes, one implementation:

| Use | `expectedDiff` | Verdict on a mismatch |
|---|---|---|
| Ordinary edit | the cells edited | warn |
| Definition edit | every cell the impact estimate named | warn — an unforeseen ripple is exactly the bug this catches |
| **Refactor** | **empty** | **refuse — one changed cell fails it** |

The third row is why an assistant can be allowed to restructure a spec at all: a
proposal that provably changes nothing visible is safe to accept regardless of
how it was produced. (ADR-009)

## 5. Verification tiers

- **Tier 1 — unit tests** (vitest), per package, the bar for every phase. The
  core is I/O-free so it tests on strings and values.
- **Tier 2 — CST fidelity.** Parse → serialize with an empty patch is
  **byte-identical**, over the whole yxl `examples/` corpus and a fixture set of
  deliberately awkward YAML (comments in every position, flow style, anchors,
  block scalars, CRLF, BOM, tabs in strings). Then: apply one patch, and assert
  the diff touches only the intended lines. This tier is what protects the
  promise in §1; it runs on every commit.
- **Tier 3 — differential conformance against `yxl` itself.** The MoonBit core
  compiles to JavaScript (measured — ADR-012), so the real loader can run in-
  process as a **test-only oracle**. For every spec in `examples/`, assert the
  TypeScript model agrees with the MoonBit model, and that accept/reject verdicts
  agree on a corpus of deliberately invalid specs. This is the direct answer to
  "we now maintain a second implementation of the schema"; without it, that risk
  is unbounded, and with it, drift becomes a red build.
- **Tier 4 — end to end.** Open a real spec in the extension, perform a scripted
  edit, run the **shipped `yxl` binary** over the result, and assert the workbook
  it produces holds what the edit claimed. Nothing else proves the loop closes.
- **Tier 5 — manual, before a release.** A real workbook, a real person, Excel
  opening the output.

CI additionally enforces the §4.2 dependency direction (no upward imports, no
`vscode` import outside `extension`, no DOM outside `webview`) — an architecture
rule that is not mechanically checked is a suggestion.

## 6. Phase roadmap

Phases land in order. Each is releasable or explicitly marked otherwise. The
**first release is Phase 4** — read-only, and worth shipping alone.

### Phase 0 — Bootstrap
- [x] pnpm workspace, TypeScript strict, the §4.2 package skeleton (empty but
      wired, so the dependency graph is real from day one).
      **Shipped** as 13 packages under `packages/`, each declaring
      `exports: ./src/index.ts` so nothing is built to be imported. TypeScript 7
      with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
      `verbatimModuleSyntax`, and the unused-locals checks on from the start —
      cheaper now than retrofitted over a populated tree.
- [x] vitest, formatter/linter, the CI workflow (typecheck, test, lint,
      dependency-direction check).
      **Shipped**: vitest 4, Biome 2 (one tool for lint and format), and
      `scripts/check-layers.mjs`, which reads the order from `layers.json` and
      fails on an upward import or a host reached from the wrong package. It
      checks **both** the declared `dependencies` and the source imports — the
      manifest is exact but coarse, and the sources are where a stray `node:fs`
      shows up. 18 tests cover it, including the cases it would be embarrassing
      to miss (re-exports, dynamic imports, type-only imports, wrapped import
      lists, a node builtin imported without its prefix).
      Two host rules are enforced by the *compiler* rather than the script, which
      is stronger: no package has `@types/node` in scope, and the DOM lib is
      reachable only from `packages/webview/tsconfig.json`. So `document` in a
      core package is a type error, not a lint finding.
- [x] `AGENTS.md` + `CLAUDE.md` symlink, `README.md`, Apache-2.0 `LICENSE`
      (matching yxl)
- [x] Pin the `yxl` version this editor targets, in one place, and state the
      compatibility rule (§8 Q6). **Shipped** as the `yxl` field in the root
      `package.json` (`targetVersion`, `oracleRepo`); the rule is §8 Q6.
- [x] Retire `docs/design-provenance-editor.md` — its content is now §4 and §7
      (see §11)

### Phase 1 — L0: the CST seam
The riskiest thing in the project, so it goes first and gets proven before
anything is built on it.
- [x] `cst`: parse to a span-carrying tree over `eemeli/yaml`'s CST layer.
      **Shipped.** Scalars, mappings, sequences; a span on every node; none of
      the library's types in the public API. A scalar keeps both its resolved
      value and its source text, and plain scalars resolve by the YAML 1.2 core
      schema — which is what makes `"007"` text and `007` seven. An integer too
      large for a double stays text rather than rounding. Aliases, non-text
      keys, and a second document are refused with a diagnostic and the read
      continues. `diag` (spans, positions, diagnostics) landed with it, since a
      span-carrying tree needs somewhere to put the spans.
- [x] Apply an op list as a minimal byte patch; comments, key order, quoting
      style, blank lines, and indentation of untouched regions survive.
      **Shipped** as `set` / `renameKey` / `remove` / `insert` over YAML nodes —
      fewer operations than the spec-level algebra of §4.5, which addresses spec
      constructs and belongs to `patch`. The mechanism turned out to matter more
      than the operation list: **ADR-017**, edits as text ranges rather than a
      re-serialization, which makes preservation structural instead of
      best-effort. `set` keeps the quoting style the node already had, and
      quotes a value that would otherwise read back as another type.
      Not done, deliberately: inserting a whole collection (a scalar is all the
      syntax layer needs asked of it so far), `rekeyMap` (a composition, and
      Phase 8's), and structural edits inside flow collections (refused with a
      diagnostic — ADR-017).
- [x] Tier 2 byte-identity harness (§5) green over `examples/` + the awkward
      fixtures. **Shipped** as `tests/`, a workspace package holding corpus
      harnesses and no product code — the same shape as yxl's `src/examples`.
      It runs over **18 upstream example specs and 7 awkward fixtures** (a
      comment in every position, flow style, all four block-scalar forms,
      tricky quoting, CRLF, a BOM, odd indentation), asserting four things per
      sample: the CST retains it character for character, it parses clean, every
      scalar's span slices back to the same value, and a single `set` changes
      exactly one line. `.gitattributes` keeps git from normalizing the CRLF and
      BOM fixtures, which would quietly void what they test. The corpus size is
      asserted, so a missing sibling checkout fails instead of passing
      vacuously.
- [x] Establish what we do about the library's documented instability around
      **trailing-comment association** — a fixture that pins current behaviour,
      and a decision recorded as an ADR if we must work around it (§9 R2).
      **Answered: it does not reach us** (ADR-017). The hazard is in the
      Document API's parse → modify → stringify cycle, and we never stringify.
      Writing the fixtures did surface a *different* comment defect that is ours
      alone — inserting before an item put the new item between that item and
      the comment describing it — now fixed by stepping back over a contiguous
      comment block, stopping at a blank line, and pinned in both directions.

### Phase 2 — L1: SpecDoc and the loader
Sliced by schema area; each slice is "load it, and the differential oracle
agrees". Coverage grows over later phases — Phase 2 targets the constructs a
grid must understand to be drawn at all.
- [ ] `spec`: the AST types for the core subset — `params`, `defs.styles`,
      `defs.values`, `defs.formulas`, `sheets`, `cells`, `data` (inline / csv /
      json), `formulas` ranges, `columns` / `rows` bands, `merges`
- [ ] `loader`: CST → SpecDoc for that subset, with spans carried onto every node
- [ ] `$include` expansion through an injected reader (the core stays I/O-free —
      yxl ADR-014 has already solved this shape; copy it)
- [ ] Verbatim preservation + `opaque` marking for every *other* valid construct
      (tables, charts, images, pivots, validations, conditional formats, shapes,
      sparklines, controls, slicers, protection, print setup, properties)
      (ADR-011)
- [ ] `NodeId` derivation and the session identity map (ADR-015)
- [ ] Tier 3 differential harness stood up and green (ADR-012)

### Phase 3 — L2/L3: compile and provenance
- [ ] `compile`: SpecDoc → CompiledGrid, deterministic, no I/O
- [ ] Per-facet provenance for value and format (§4.3)
- [ ] Style resolution as an ordered layer list — workbook default, column band,
      row band, named style (with `extends:` chains), inline, override — each
      layer recording only what it contributed
- [ ] `params` substitution recorded as `param` provenance, not flattened away
- [ ] Editability classification derived from origins (§4.3)
- [ ] Impact estimation: given a definition node, which cells does it reach

### Phase 4 — Read-only preview  ← **first release**
The design note's judgement was that this alone solves most of the problem, and
that judgement holds: seeing the workbook while editing the text is most of the
value, and it carries none of the write-back risk.
- [ ] VS Code custom editor for `*.yxl.yaml`, opening beside the text editor
- [ ] Grid rendering: values, formulas as text, styles, merges, column widths,
      row heights, multiple sheets (grid library choice — §8 Q5)
- [ ] Provenance inspector: select a cell, see where each facet came from,
      property by property
- [ ] **Bidirectional jump**: grid cell → the YAML node that produced it, and
      cursor in YAML → the cells it produces (highlighted). This is the feature
      that makes the release worth shipping.
- [ ] Diagnostics from the loader shown inline in the grid and as VS Code
      problems
- [ ] `yxl build` / `--check` invoked as commands, output surfaced, binary
      discovery and a clear message when it is missing
- [ ] Live re-projection on text edit, debounced
- [ ] `params` switcher, so one spec previews as several workbooks

### Phase 5 — Evaluated preview
- [ ] `evaluate` seam: `CompiledGrid` → computed values, display only
- [ ] Adapter over `@univerjs/engine-formula` (Apache-2.0 — ADR-013)
- [ ] Cells show the computed value with the formula available; an evaluation
      failure degrades to showing the formula, never to a wrong number
- [ ] Unsupported-function reporting, so the gap between us and Excel is visible
      rather than silent
- [ ] The evaluated value is unreachable from every write path — asserted, not
      assumed

### Phase 6 — `direct` write-back
The first phase where the file changes. Scope is deliberately the subset where
the inverse is unique, so no dialog is needed yet.
- [ ] `patch` + inverse ops; AST-level undo/redo
- [ ] `verify` loop wired in front of every apply (ADR-009)
- [ ] `setValue` / `setFormula` on `literal` and `inline` origins
- [ ] `overrides:` as an explicit escape hatch, with the "manually edited" badge
      and the optional `reason:`
- [ ] Everything not `direct` is visibly, explainedly read-only — the editor is
      honest about what it cannot yet do
- [ ] Tier 4 end-to-end green

### Phase 7 — `mediated` write-back
Where it starts to feel like a spreadsheet.
- [ ] The §4.4 resolution table, row by row
- [ ] Resolution dialog: candidates, each with a pre-computed impact summary and
      a sample of affected cells
- [ ] `normalize`: the style normalizer, ahead of every style write (ADR-008)
- [ ] Range edits with mixed origins
- [ ] `external` origins: edit the companion CSV/JSON, or divert to `overrides:`
- [ ] Surprise-diff confirmation UI for the `ok: 'confirm'` verdict

### Phase 8 — Structural edits
- [ ] `insertRow` / `insertCol` / `deleteRow` / `deleteCol`, with the
      consequence enumeration and the expected-diff-size preview (§4.4)
- [ ] `rekeyMap` for bulk A1 shifts in `cells:`
- [ ] `merge` / `unmerge`, column and row resize, band creation
- [ ] The "convert this rectangle to `data:`" offer, at the moment a `cells:`
      block proves it needs it
- [ ] Cut / copy / paste as intents — including paste from Excel, which is the
      gesture most likely to produce a mess and most needs the normalizer

### Phase 9 — Deterministic refactors
Everything here is detectable by analysis. **No model involved** — which is the
point, and is why it precedes Phase 10.
- [ ] Identical resolved styles at N sites → extract to `defs.styles`
- [ ] Homogeneous `cells:` rectangles → `data:` with inline `values:`
- [ ] Columns of translated formulas → a `formulas:` range
- [ ] Accumulated `overrides:` sharing a pattern → a definition
- [ ] All of the above gated on **`expectedDiff: empty`** — a refactor that
      changes one rendered cell is rejected, automatically (ADR-009)
- [ ] Presented as reviewable proposals with a diff, never applied silently

### Phase 10 — Assistant
- [ ] Proposal-only interface: output is a `Patch`, constrained to its JSON
      schema, and passes §4.6 like anything else
- [ ] Naming: `style_7` → a role name, from the evidence of where it is used
- [ ] Parameterization proposals across near-identical sheets
- [ ] Natural-language edits (non-empty expected diff — always shown, always
      confirmed)
- [ ] Context is a **summary** — style inventory, sheet shapes, detected
      candidates — never the whole grid
- [ ] Provider behind a seam; works with a local model, since correctness comes
      from §4.6 rather than from the model

### Phase 11 — Beyond VS Code
- [ ] Tauri shell reusing `webview` unchanged; only `extension` is replaced
- [ ] Standalone `.yxl.yaml` file association for people who do not use VS Code

### v1.0 — Stability gate
- [ ] Schema coverage stated honestly: which of `docs/spec.md`'s 22 sections are
      editable, which are preview-only, which are opaque — as a table in the
      README, generated from the code so it cannot lie
- [ ] Tiers 1–4 green in CI; Tier 5 performed
- [ ] Compatible with a frozen yxl schema (yxl's own v1.0 gate — §8 Q6)
- [ ] Marketplace listing, and an honest description of what it is not (§2)

## 7. Architecture Decision Records (ADRs)

Accepted ADRs are never rewritten — a change of mind is a new ADR that
supersedes the old one.

### ADR-001 — The grid is a projection; write-back resolves, never infers
**Accepted.** `compile: SpecDoc → Grid` is a pure total function. Its inverse is
not a function: many specs project to the same grid. Rather than pick a
pre-image by heuristic, the editor enumerates them (§4.4) and lets the user
choose; one candidate applies silently, several open a dialog, none is read-only
with a stated reason.

*Why not infer:* a heuristic is right most of the time, and the cases it gets
wrong are silent, structural, and discovered months later in a diff nobody read.
The whole value of the spec form is that it says exactly one thing; a guessing
editor trades that away for keystrokes. Asking is slower and correct, and the
impact preview makes asking cheap.

### ADR-002 — TypeScript core; `yxl` stays a separate MoonBit compiler
**Accepted.** L0–L4 are implemented in TypeScript in this repository. `yxl` is
consumed as a CLI (`build`, `--check`, `extract`) and, in tests only, as a
conformance oracle (ADR-012).

*Alternative considered and rejected: compile the MoonBit core to JavaScript and
reuse it as the loader.* This was measured rather than assumed, and it works:

| Check | Result |
|---|---|
| `moon check --target js` over `yaml`/`model`/`loader`/`render` | clean |
| `moon test --target js` over the same | 358/358 pass |
| `moon test --target js` over `emit`/`cli` (mbtexcel + zip) | 159/159 pass |
| `moon build --target js` whole module | builds, emits `main.d.ts` |
| Scaling, JS target | 400 rows 32 ms → 6400 rows 463 ms |

So the entire yxl pipeline — including `.xlsx` byte emission — runs in
JavaScript today. The dependency graph also already isolates the backend:
`diag`, `units`, `yaml`, `model`, `loader`, `render` are mbtexcel-free, and
`render` is a working `model → YAML` serializer.

It was still rejected, for reasons that are about the project rather than the
technology: the edit layer (L0/L4) is where nearly all of this project's code
will live and it is not shared with yxl, so a MoonBit core would put a
cross-language boundary through the middle of the codebase rather than at its
edge; the contributor and dependency ecosystem for a VS Code extension is
TypeScript; and shipping a generated multi-megabyte JS bundle inside an
extension imposes a build coupling on every contributor.

**The cost is real and is not waved away:** the schema now has two
implementations, and `docs/spec.md` is 1351 lines. Three things bound it —
ADR-011 (we implement only what projection needs, not the whole schema),
ADR-012 (both implementations are tested against each other on every commit),
and the rule that `yxl build --check` remains the validator of record. If Tier 3
drift becomes chronic, this ADR is the one to revisit, and the measurements
above are why revisiting is cheap.

### ADR-003 — CST-preserving YAML via `eemeli/yaml`
**Accepted.** `eemeli/yaml` (ISC), used at its **CST layer** rather than its
Document layer for write-back. The CST retains every character of input, and
`CST.setScalarValue()` and friends edit tokens in place, so untouched regions
keep their bytes.

The Document layer is easier but re-prints, and its comment handling is
documented as "not completely stable, in particular for trailing comments" —
which for us is not a cosmetic issue: a comment that migrates to a different node
is a corrupted spec that still parses. So: CST for writing, Document for
convenience only where nothing is written back. §5 Tier 2 enforces this with
byte-identity, and Phase 1 pins the trailing-comment behaviour with a fixture
before anything is built on top.

*Alternative rejected:* generating YAML from the AST (as yxl's `render` does for
`extract`). Correct for a one-time extraction, unacceptable for an editor — it
would erase the user's comments and formatting on the first keystroke.

### ADR-004 — The core is I/O-free and UI-free; shells live at the edge
**Accepted.** `cst`, `spec`, `loader`, `compile`, `intent`, `normalize`,
`verify`, `patch`, `evaluate` import neither `vscode`, nor `node:fs`, nor the
DOM. Files arrive through injected readers; the shell supplies them. Mirrors yxl
ADR-003, and is what makes Phase 11 a packaging change instead of a rewrite. CI
enforces it (§5).

### ADR-005 — Provenance is per-facet, with style as an ordered layer list
**Accepted.** See §4.3. A cell's value, number format, and each style property
are tracked independently, and style keeps the full stack of contributing layers
rather than a resolved result.

*Why:* value-from-CSV with format-from-a-band is not an exotic case, it is the
common one. And the layer list is not merely for display — it *is* the candidate
generator for `setStyle` (§4.4). Collapsing it would mean re-deriving the
candidates by search, which is where guessing creeps back in.

### ADR-006 — Editability classes drive the UI
**Accepted.** `direct` / `mediated` / `external` / `readonly` (§4.3) are computed
during compilation and are the single input to how a cell behaves under the
cursor. The UI holds no second opinion about what is editable, so a phase that
adds an origin gets its UI behaviour automatically.

### ADR-007 — `overrides:` is the designated place for edits that will not resolve
**Accepted.** A top-level `overrides:` list (`at:`, the facet, an optional
`reason:`) applied last, recorded in provenance as `kind: 'override'` so the
grid can badge it.

*Why a visible pile rather than a quiet one:* the alternative to an override is
breaking apart the structure that made the edit ambiguous — inlining a
definition, splitting a formula range — which silently destroys the DRY
properties yxl exists to provide. An override keeps the structure intact and
puts the mess in one place where it can be counted; twenty overrides is a
legible signal that the spec's shape is wrong, and Phase 9 can propose folding
them back in.

*Status:* the construct does not exist in the yxl schema, and is requested
upstream as [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) rather than
invented here — a spec this editor writes must compile with a stock `yxl`
(ADR-011). Should it be declined, the fallback is a plain `cells:` entry
relying on yxl's documented last-wins key order: the edit still lands, and what
is lost is the badge, the `reason:`, and the ability to count how dirty a spec
has become (§8 Q9).

### ADR-008 — Every style write passes the normalizer
**Accepted.** Before a style reaches the spec: (1) exact match against an
existing definition → reference it; (2) near match within a small property
distance → `{ extends: B, …delta }`; (3) otherwise a new definition, named
neutrally (`style_7`) with a descriptive name proposed only on strong evidence.

*Why it is non-negotiable:* without it, the tenth fill-colour click leaves ten
anonymous inline styles and the spec is worse than the workbook it replaced.
With it, GUI-written specs are structurally indistinguishable from hand-written
ones — which is the §1 convergence claim, made real.

### ADR-009 — The verification loop gates every write
**Accepted.** §4.6. Compile before, compile after, diff, compare against the
patch's own `expectedDiff`. No path — GUI, refactor, assistant — bypasses it.

*The consequence worth naming:* with `expectedDiff: empty`, a structural change
that provably alters no rendered cell can be auto-approved no matter what
produced it. That is what makes Phase 10 safe with a small local model: the model
affects the *acceptance rate* of proposals, never their correctness.

### ADR-010 — Patches are invertible; undo is AST-level
**Accepted.** Every `Op` generates its inverse, so undo/redo operate on the AST
rather than on text. Text-level undo would fight with the user's own edits in the
same file and with the minimal-patch serializer; AST-level undo stays coherent
when grid edits and hand edits interleave, which they will constantly.

### ADR-011 — A projector, not a validator; unmodeled constructs are preserved verbatim
**Accepted.** Two rules with one motivation.

*Preserve:* any construct that is valid yxl but not yet modeled here is carried
through the CST untouched and marked `opaque` — shown in the grid as
"not editable in this editor", never dropped, never reformatted. Opening a spec
that uses pivot tables and slicers in Phase 4 must not damage it.

*Defer validation:* we validate exactly what projection requires. `yxl build
--check` is the validator of record and its diagnostics are surfaced as-is.

*Why:* it makes schema coverage incremental instead of all-or-nothing, and it
keeps one authority for what is legal. Note this is a **deliberate departure**
from yxl's fail-fast-on-unknown-keys (yxl ADR-006), and the reason the two differ
is that the roles differ: yxl compiles and must refuse what it cannot render;
this editor edits and must not destroy what it cannot render. An unknown key
still surfaces as a diagnostic — from `--check` — it simply does not stop the
editor from opening the file.

### ADR-012 — Differential conformance against the MoonBit core
**Accepted.** `yxl` is built to the JS target and used **in tests only** as an
oracle: the TypeScript model must agree with the MoonBit model over the entire
`examples/` corpus, and accept/reject verdicts must agree over a corpus of
invalid specs. Feasibility is measured in ADR-002's table.

*Why it earns its keep:* ADR-002 knowingly created a second implementation.
"We will keep them in sync" is a promise; this is a build failure. It also
inverts the drift problem — when yxl's schema moves (and it moves until yxl's
v1.0), the oracle tells us on the next dependency bump instead of a user telling
us later.

### ADR-013 — Formula evaluation behind a seam; `@univerjs/engine-formula`
**Accepted.** Evaluation is display-only, behind an interface, and unreachable
from every write path.

Licence was the deciding constraint, and the options were checked rather than
recalled:

| Candidate | Licence | Verdict |
|---|---|---|
| `@univerjs/engine-formula` 0.25.1 | Apache-2.0 | **chosen** — parser, dependency graph, and calculation, actively maintained |
| `@formulajs/formulajs` 4.6.1 | MIT | fallback — function library only, no parser or dependency graph |
| `fast-formula-parser` 1.0.19 | MIT | fallback — complete, but last published 2020 |
| `hot-formula-parser` 4.0.0 | MIT | fallback — parser only |
| HyperFormula | GPL-3.0 / commercial | **rejected** — would force the whole product to GPL-3.0 or require a commercial licence, foreclosing options for no functional gain over an Apache-2.0 engine |

Behind the seam, so a swap costs one adapter.

### ADR-014 — Cell edits never write an evaluated value
**Accepted.** A computed number is never a candidate for anything written to the
spec, and a cell whose displayed value came from `evaluate` is `readonly` unless
it also has a writable origin. This is yxl's "not a spreadsheet engine"
non-goal held at the one place where a GUI would erode it: it is exactly the
gesture — click a computed total, type over it — that would turn a formula into
a hardcoded constant, quietly.

### ADR-015 — `NodeId` is derived, never persisted
**Accepted.** Ids are derived from the path at load time, kept stable within a
session through an identity map (so an array insert does not renumber
everything), and re-derived on reload — a reload may lose UI selection state, and
that is an acceptable price.

*Why not persist:* a spec is text that humans and agents hand-write. The instant
it carries tool-generated ids it stops being ordinary reviewable YAML, which is
the entire proposition (§2).

### ADR-016 — Toolchain: pnpm, TypeScript 7, vitest, Biome
**Accepted.** Development dependencies, recorded because §9 requires a dependency
to be argued for rather than merely installed.

- **pnpm workspaces.** Strict `node_modules` means an undeclared cross-package
  import fails to resolve, so the §4.2 dependency graph is partly enforced by
  the package manager before any check runs.
- **TypeScript 7**, strict, plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. Turned on while the
  tree is empty; each is painful to adopt later.
- **Biome** for lint and format, over ESLint + Prettier: one tool, one config,
  and no plugin matrix to maintain. It is not type-aware, which is the real
  trade — we accept it because `tsc` at this strictness is where type-level
  mistakes get caught anyway.
- **vitest** for all tiers.

**One finding worth recording, because it will come up again:** TypeScript 7's
npm package exports only `lib/version.cjs` — the JavaScript compiler API
(`ts.preProcessFile`, `ts.createProgram`, …) is no longer shipped, and the
replacement (`typescript/unstable/sync`) is named for its stability. The layer
checker was written against `preProcessFile` and had to be rewritten without it.
Anything here that wants to *analyse* TypeScript source — a future codegen step,
or generating the §8 Q7 JSON Schema — has to pick a parser deliberately rather
than assume the compiler API is there.

### ADR-017 — Write-back is a list of text edits, not a re-serialization
**Accepted.** Refines ADR-003 with how the minimal patch is actually produced.

An op does not mutate the CST and stringify it back. It resolves to a **text
edit** — one span of the source and its replacement — and the edits are applied
back to front. The bytes between the edits are the original file, untouched
because they were never candidates for rewriting.

*Why this rather than mutate-and-stringify:*

1. **Preservation stops being a property to verify and becomes one to state.**
   Comments, key order, quoting style, blank lines, and indentation outside the
   edited span cannot change, because no code path can reach them.
2. **The library's documented instability around trailing-comment association
   does not apply to us.** That hazard lives in the Document API's
   parse → modify → stringify cycle. We never stringify, so a comment is never
   re-attached to anything. This is the answer to the Phase 1 question that
   asked whether we would need a workaround: **we do not**, and the reason is
   architectural rather than lucky.
3. **The edits are the diff.** `Applied.edits` is returned, so the verification
   loop (ADR-009) and the UI can show exactly which ranges moved without
   re-deriving them.

*What it costs, and where the comment problem does still bite us.* Text edits
know about lines, not about what a comment means. Inserting before an item whose
description sits above it would put the new item between the comment and its
subject — so the insert steps back over a contiguous comment block, and stops at
a blank line, on the reading that a comment separated by one is a section
heading rather than a label. That is a *heuristic about layout*, which is
allowed; ADR-001 forbids guessing which **spec** the user meant, not how a line
should be indented. It is pinned by tests in both directions.

The remaining gap is **flow collections**: removing from or inserting into
`{ … }` / `[ … ]` needs comma and bracket handling that a line-oriented edit
cannot express, so both are refused with a diagnostic rather than attempted.
`set` works inside flow collections, which is the case that actually comes up.
Lift this when a phase needs it, not before.

## 8. Open questions

- **Q1 — `cells:` A1 keys and row insertion.** Inserting a row rewrites every
  key below it; `rekeyMap` handles it mechanically but the diff is still total.
  yxl's Phase 11 answered this for tabular regions with inline `data:` `values:`,
  which is the right answer for most cases — so Phase 8 should *steer* toward
  conversion rather than optimize the shift. Remaining question: is
  anchor-relative addressing in `cells:` worth proposing upstream for the
  scattered case? Decide before Phase 8.
- **Q2 — How much formula translation do we do?** Splitting or extending a
  `formulas:` range requires translating relative references. Needs a formula
  parser (the Phase 5 evaluation engine has one). Prototype during Phase 5, when
  the parser is already in the build, and decide before Phase 7 commits to the
  `formulaRange` resolutions.
- **Q3 — External change detection.** The file will change under us — the CLI,
  an agent, a git checkout. Working assumption: discard the AST, re-derive, lose
  UI selection state. Confirm this is enough during Phase 4, when it first bites.
- **Q4 — Where do new nodes go, across `$include`?** Provenance names the source
  file for existing nodes, but an addition has no file yet. Working assumption:
  the file backing the sheet being edited, shown in the resolution dialog so it
  is never a surprise. Confirm in Phase 6.
- **Q5 — Grid UI.** Requirements are unusual: per-cell editability control,
  provenance affordances (badges, origin tinting), and large-sheet performance.
  Candidates: `@univerjs/*` (Apache-2.0, brings a full spreadsheet model of its
  own — which fights ADR-001's "the grid holds no state"),
  `@glideapps/glide-data-grid` (MIT, canvas, fast, but a data grid rather than a
  spreadsheet), or building on canvas directly. **Decide in Phase 4**, and note
  that Phase 5 already brings `@univerjs/engine-formula` into the tree, which
  changes the calculus. Handsontable is out — proprietary.
- **Q6 — Version compatibility with `yxl`.** ✅ **Rule decided (Phase 0); the
  packaging half is still open.** The schema is not frozen until yxl's v1.0, so
  this editor targets **exactly one** yxl version, pinned in the root
  `package.json`'s `yxl.targetVersion` and nowhere else. The rule:

  1. The pinned version is what the Tier 3 oracle (ADR-012) is built from, and
     what the loader's schema coverage is written against. Raising the pin is a
     deliberate change with its own PR, and the oracle is what reviews it.
  2. A **newer** CLI on the user's machine is a warning, not a refusal — a spec
     we write is ordinary yxl and will still compile, and refusing would make
     this editor an obstacle to upgrading yxl.
  3. An **older** CLI is also a warning, naming the pinned version, because a
     construct we let the user write may not exist there yet.
  4. Neither warning blocks editing. `yxl build` failing is the honest signal,
     and it already has a good error message (yxl ADR-006) — we surface it
     rather than pre-empting it.

  Still open: do we bundle a binary or require one on `PATH`? Bundling means
  shipping per-platform binaries and taking on their update cadence; requiring
  one means an install step for the user. Decide in Phase 4, when the CLI is
  first invoked.
- **Q7 — The JSON Schema.** yxl's Phase 11 has an unchecked item: publish a JSON
  Schema generated from `docs/spec.md`. That artifact would serve this editor's
  loader directly. Worth building **upstream in yxl** rather than here, and worth
  offering to do — it is one artifact serving both, and generating it there keeps
  it honest against the reference.
- **Q8 — Tauri.** Phase 11. Nothing in the architecture blocks it (ADR-004); the
  question is whether the demand exists.
- **Q9 — `overrides:` must exist upstream.** ADR-007 depends on a construct the
  yxl schema does not have today. **Filed upstream as
  [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66)** (2026-08-14); awaiting
  a decision, which is needed before Phase 6 and before yxl's schema freeze.

  Writing it up changed what the request is. yxl **already has the capability**:
  `docs/spec.md` §2 says sheet keys apply in the order written, so a `cells:`
  entry placed after a `data:` block wins, and all three hard cases (param,
  CSV, formula range) can be expressed that way today. What is missing is
  **intent** — an override written as an ordinary cell cannot afterwards be
  counted, explained, or folded back, and it makes the spec's correctness
  depend on YAML key order, which a reformat can silently break.

  So this is not a blocker on capability, and Phase 6 is **not hard-blocked**:
  if the answer upstream is no, `overrides:` becomes a `cells:` write and ADR-007
  loses its badge, its `reason:`, and the health signal — a worse product, not
  an impossible one. Design for both until it is answered.
- **Q10 — What do we send upstream from ADR-002's measurements?** yxl's own §8
  Q6 asks "native binary only, or also a wasm CLI?" — and the answer here is that
  the whole pipeline, `emit` included, already passes its tests on the JS target.
  That is directly useful to yxl and costs us nothing to report.

## 9. Risks

- **R1 — Schema drift between the two implementations.** The structural
  consequence of ADR-002 and the largest risk in the project. Mitigated by
  ADR-011 (bounded surface), ADR-012 (measured, on every commit), and pinning
  (§8 Q6). Watch: if Tier 3 needs manual repair more than occasionally, revisit
  ADR-002.
- **R2 — CST write-back is harder than it looks.** Comment attachment, block
  scalars, flow collections, anchors. The library itself documents instability
  around trailing comments. Mitigated by putting it in Phase 1 with a byte-
  identity gate, so it fails early and cheaply rather than in Phase 6.
- **R3 — The resolution dialog is annoying.** If routine edits ask questions, the
  product is worse than editing YAML. Mitigations: `direct` origins never ask
  (which is why Phase 6 exists as its own phase), a remembered choice per
  origin-kind, and honest measurement of the ask rate during Phase 7. If it
  cannot get low, that is a finding about the design, not a UX tweak.
- **R4 — Scope.** `docs/spec.md` is 1351 lines across 22 sections. ADR-011 makes
  coverage incremental, but "editable in the GUI" will lag "expressible in yxl"
  for a long time, and the README must say so plainly rather than imply parity.
- **R5 — Webview performance.** Large sheets in a VS Code webview, re-projected
  on every keystroke. Mitigations: debounce, incremental compilation keyed by
  node, virtualized rendering. Measure in Phase 4 with a deliberately large spec
  before choosing the grid (§8 Q5).
- **R6 — Evaluation disagrees with Excel.** Any preview engine will differ from
  Excel somewhere. Mitigated by ADR-014 (never written back), visible
  unsupported-function reporting, and "Excel is the renderer of record" stated in
  the UI, not just here.
- **R7 — The upstream dependency (§8 Q9).** *Downgraded 2026-08-14.* Filing
  [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) established that yxl can
  already express an override through `cells:` last-wins precedence, so Phase 6
  is not blocked on the answer — a rejection costs the badge, the `reason:`, and
  the health signal, not the feature. Still wanted before yxl's schema freeze,
  after which it would be a breaking change rather than an addition.

## 10. How to "進める" (pick the next task)

1. Open §6 and find the **first phase with an unchecked box**.
2. Take the next unchecked item in that phase.
3. Implement it end to end — code, tests at the tiers §5 requires for that layer,
   and docs.
4. Run the validation loop in `AGENTS.md §4`.
5. Tick the box, append a §11 changelog entry, and add an ADR to §7 if a
   decision was made along the way.

If the task is not on the active phase's list, **stop and discuss scope** rather
than widening it silently.

## 11. Living changelog

### 2026-08-14 — Project bootstrapped
- Reviewed `yxl` (v0.3.3, MoonBit, Phase 10/11 of its own roadmap) and the
  design note in `docs/design-provenance-editor.md`.
- **Measured that yxl's whole pipeline runs on the JS target** — 358/358 core
  tests and 159/159 `emit`/`cli` tests pass under `--target js`, including
  mbtexcel-backed `.xlsx` emission (ADR-002). Recorded because it decides
  ADR-002 and ADR-012, and because it answers a question yxl is holding open
  (§8 Q10).
- Established the layer stack, package map, provenance model, resolution table,
  and verification loop (§4), the five verification tiers (§5), and the phase
  plan (§6). ADR-001 … ADR-015 recorded.
- Chose TypeScript for the core (ADR-002), `eemeli/yaml`'s CST layer for
  serialization (ADR-003), and `@univerjs/engine-formula` for evaluation on
  licence grounds, with HyperFormula rejected for GPL-3.0 (ADR-013). Licences
  were verified against the registry, not recalled.
- `docs/design-provenance-editor.md` is **superseded by §4 and §7** of this file.
  It is kept for one commit so nothing is lost in review; delete it in Phase 0,
  per the one-source-of-truth rule this project inherits (`AGENTS.md §1`).

### 2026-08-14 — Phase 0 complete
- pnpm workspace with the 13 packages of §4.2, wired but empty; TypeScript 7 at
  full strictness; vitest; Biome; the CI workflow. `docs/` retired (§6 Phase 0).
- **The §4.2 dependency direction is now a build failure rather than a
  convention.** `layers.json` declares the order once and
  `scripts/check-layers.mjs` enforces it over both the declared dependencies and
  the source imports, with 18 tests of its own.
- Two of the three host rules turned out to be enforceable by the type checker
  instead of by a script, which is strictly better: no package has node types in
  scope, and the DOM lib is reachable only from `packages/webview`. `vscode` and
  the node builtins are still script-checked, since `@types/node` would
  otherwise be ambient everywhere.
- yxl compatibility rule decided and written down (§8 Q6); the target version is
  pinned in one place.
- Toolchain recorded as ADR-016, including the discovery that TypeScript 7 no
  longer ships the JS compiler API — which changed how the layer checker had to
  be written and constrains any later source analysis.

### 2026-08-14 — Phase 1 complete: the CST seam
- `cst` parses YAML into a span-carrying tree and applies ops as a minimal byte
  patch, with `diag` underneath it. 191 tests.
- **ADR-017**: write-back is a list of text edits, not a re-serialization. This
  was the phase's real result. It makes "untouched bytes stay untouched"
  structural rather than best-effort, and it **dissolves R2** — the library's
  trailing-comment instability lives in an API we now never use.
- The risk that remained was ours, not the library's: inserting before an item
  detached the comment above it from what it described. Found by writing the
  fixtures the phase asked for, fixed, and pinned in both directions (including
  the blank-line case, where the comment is a heading and the new item belongs
  *under* it).
- Tier 2 stands up over the real upstream corpus — 18 example specs plus 7
  fixtures built to be hostile to a serializer — with the corpus size asserted
  so it cannot pass by finding nothing.
- Phase 1 was scheduled first because it was judged the riskiest part of the
  project. It is worth recording that it was not: the CST layer held, and the
  scope left undone (flow-collection structural edits, collection inserts) is
  bounded and named rather than discovered.
- CI runs against a sibling `yxl` checkout, which the Tier 3 oracle will need
  too. `defaults.run.working-directory` governs `run:` steps only, so the pnpm
  action needed its manifest path given explicitly — the sort of thing that only
  shows up once the workflow is real.

### 2026-08-15 — Refactoring pass (`AGENTS.md` §8)
Walked the lenses in order over everything Phases 0–1 landed. Two of the
findings were defects rather than untidiness, which is the argument for doing
this at a phase boundary rather than at the end.

- **A line inserted into a CRLF file was written with a bare `\n`.** Every later
  diff would have reported the mixed endings as changes nobody made, and the
  CRLF fixture did not catch it because the corpus only exercises `set`. Fixed
  by taking the line ending from the file; regression test added.
- **`renderScalar` had no direct tests at all** — it was exercised only through
  `apply`. Now covered, and more usefully, the writer is asserted against the
  *reader*: what `renderScalar` writes, `parse` reads back unchanged, over 24
  values. These are two halves of one contract living in different files, and a
  disagreement between them would silently change a value's type on the next
  open. Writing that test is what showed the first version of the assertion was
  too weak (it checked the plain resolver, which never sees a quoted scalar).
- **Diagnostic codes are now named once** in `cst/codes.ts` rather than spelled
  at each throw site, with the `cst.` prefix no longer built in two files.
  `AGENTS.md` §8.1 names diagnostic codes as domain constants; tests assert
  against the constants.
- **Deleted every export with no caller**: three type guards, `contains`,
  `warning`, `hasError`, `Position`, and `isPlainSafe`'s export. All were
  plausible-looking API written ahead of a user. The house precedent is yxl's
  own `resolve` package (its ADR-008), which was designed into the architecture
  and never built — speculative structure is the thing this project should be
  quickest to remove, and re-exporting later costs one line.
- Split the line/offset arithmetic out of `apply` into `cst/lines.ts`, so
  `apply` says only which edit an op becomes.
- Moved the `flow` explanation onto the `Node` doc. It had been on `Mapping`
  and not `Sequence`, which is the inconsistent-annotation failure §8.6 warns
  about, for a concept both share.
- **`README.md` said "there is no code yet"**, which stopped being true two
  phases ago. Corrected — §1's rule is that a doc which lies is worse than a
  missing one, and it applies to our own.
- 191 → 242 tests. Typecheck, lint, layer check, and build clean.

### 2026-08-14 — `overrides:` requested upstream
- Filed [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) for §8 Q9 / ADR-007.
- Writing it up changed the request and **downgraded R7**. yxl can already
  express an override, through the documented last-wins key order (`docs/spec.md`
  §2); what it cannot express is that a cell *is* one. So the ask is for intent —
  something countable, explainable, and foldable — rather than for capability,
  and Phase 6 is no longer hard-blocked on the answer. §8 Q9, §9 R7, and ADR-007
  updated to say so, including the fallback to design against in the meantime.
