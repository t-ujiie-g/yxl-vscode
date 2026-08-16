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
| `units` | — | Branded types and the readers that make them: `A1Addr`, `A1Range`, `ColumnSpan` / `RowSpan`, `QualifiedAddr`, `Color`, `SheetName`, the three definition namespaces, `ParamName`, `FilePath`, `NodeId`. Parse at the edge, pass typed inside. |
| `cst` | L0 | `eemeli/yaml` behind our own seam: source → span-carrying tree; apply an op list as a minimal byte patch. The *only* package that knows YAML syntax exists. (ADR-003) |
| `spec` | L1 | The `SpecDoc` AST — the TypeScript shape of `docs/spec.md` — and the schema's own vocabulary: `MODELED_KEYS`, which is where the line ADR-011 draws is written down. Types and tables, no logic. |
| `loader` | L1 | CST tree → `SpecDoc`, with the validation projection requires and `$include` expanded through an injected reader. Preserves unmodeled-but-valid constructs verbatim, marked `opaque`. (ADR-011) |
| `compile` | L2/L3 | `SpecDoc` → `CompiledGrid` + per-facet provenance and style layers. Pure and deterministic; the workhorse. Reaches a `csv:` / `json:` file only through an injected reader. (ADR-005, ADR-019) |
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
interface CellProvenance {       // the address is the cell's own; the style
  value:  FacetOrigin;           // stack is asked for by address, not held
  format: FacetOrigin | null;    // here — see the note below
}

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

Keeping the style a **layer list** rather than a resolved blob is what lets the
inspector answer "this is bold because `defs.styles.header` says so, and blue
because column B's band says so" — and lets the resolver generate one candidate
per layer without inventing anything. (ADR-005)

*As built*, that list is answered by `styleAt(sheet, addr)` rather than stored on
the cell: a band reaches every address in its span, written or not, so a look is
a property of an address and only a value is a property of a cell. A layer names
what holds the properties **and** how they reach the cell (`through: 'column'`
for a band, even when the properties live in a `defs.styles` entry), which is
what makes §4.4's two candidates — edit the definition, or edit the band —
distinguishable.

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
- **Tier 3 — differential conformance against `yxl` itself.** The pinned
  compiler, run as a **test-only oracle** (ADR-012, mechanism revised by
  ADR-018). Three assertions, on every commit: every spec in `examples/` builds,
  *and* reads and draws with no diagnostic at all; every spec **this editor refuses, the compiler refuses too**
  — we are never the stricter of the two; and a listed corpus of specs the
  compiler refuses and we deliberately carry, so the gap ADR-011 opens is
  measured rather than claimed. This is the direct answer to "we now maintain a
  second implementation of the schema"; without it that risk is unbounded, and
  with it, drift becomes a red build. What it does **not** yet compare is the two
  *models*, structurally — ADR-018 says why, and what it would take.
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
      It runs over **18 upstream example specs and 8 awkward fixtures** (a
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
- [x] `spec`: the AST types for the core subset — `params`, `defs.styles`,
      `defs.values`, `defs.formulas`, `sheets`, `cells`, `data` (inline / csv /
      json), `formulas` ranges, `columns` / `rows` bands, `merges`
      **Shipped**, and `units` with it: the branded types §7 requires had to
      exist before an AST could be written in them. Every node carries an id, the
      file it was written in, and its span; `Templated<T>` marks the places a
      `${param}` can stand where a value would otherwise have been read, so
      substitution stays the compiler's job. `MODELED_KEYS` names the keys this
      editor reads — the line ADR-011 draws between edited and merely carried —
      and `Sheet.keyOrder` keeps the written key order, which is what decides
      whether a `cells:` entry or a `data:` block wins (see §11).
- [x] `loader`: CST → SpecDoc for that subset, with spans carried onto every node
      **Shipped.** Reads and reports rather than stopping — a spec is wrong most
      of the time it is being edited, and a reader that gave up at the first
      half-typed key would blank the grid on every keystroke. Every one of yxl's
      example specs loads with no diagnostic but the one saying an `$include` is
      not expanded yet, which is the strongest check available on whether the
      schema was read correctly (see §11).
- [x] `$include` expansion through an injected reader (the core stays I/O-free —
      yxl ADR-014 has already solved this shape; copy it)
      **Shipped**, and it changed the reader's shape rather than adding a pass:
      a node is now read as a *site* — a node, the file it was written in, and
      its path within that file — because an include makes both of those change
      mid-walk. Ids carry the file for the same reason. The corpus test is the
      payoff: every upstream spec now loads with **no diagnostics at all**.
- [x] Verbatim preservation + `opaque` marking for every *other* valid construct
      (tables, charts, images, pivots, validations, conditional formats, shapes,
      sparklines, controls, slicers, protection, print setup, properties)
      (ADR-011)
      **Shipped** with the loader, since it is the same walk: a document or sheet
      key this editor does not model becomes an `Opaque` node carrying its key
      and the span of its whole entry. Preservation itself needs no code —
      ADR-017 writes text edits, so a region nothing edited is untouched by
      construction — and the test that *proves* it belongs to Phase 6, where
      there is finally a writer to point at it.
- [x] `overrides:` read into the AST, with the sheet-qualified address unit it
      needs (yxl v0.3.4, `docs/spec.md` §23). Newly possible: the construct
      ADR-007 waited for now exists. It belongs here rather than in Phase 6
      because an override changes what a cell *shows* — a Phase 4 preview that
      did not read it would draw a value the workbook will not have.
      **Shipped.** An override and a cell write the same six facets, so they
      share one reader and one `CellFacets` type rather than two lists that
      could drift. What an override may *land on* is not checked here — it needs
      the whole workbook in view, so it belongs to `compile` (§4.6 and the
      four rules in ADR-007).
- [x] `NodeId` derivation (ADR-015)
      **Shipped** with the loader: an id is the file plus the path that reaches
      the node, derived on every read and written to nothing. **The session
      identity map moved to Phase 4**, deliberately — see there for why, and §11
      for the characterization test that pins what it will change.
- [x] Tier 3 differential harness stood up and green (ADR-012)
      **Shipped**, with its mechanism revised — **ADR-018**. The JS target emits
      a program with no exported API, so the oracle is the pinned *release*, run
      as a subprocess; CI takes it from the release rather than building it, and
      needs no MoonBit toolchain. Conformance is one-directional plus a list:
      anything this editor refuses, the compiler refuses too, and the specs it
      refuses that we carry are enumerated so ADR-011's gap is measured.

### Phase 3 — L2/L3: compile and provenance
- [x] `compile`: SpecDoc → CompiledGrid, deterministic, no I/O
      **Shipped** for everything that puts a value in a cell: `cells:`, inline
      `data:`, `formulas:` ranges, and `overrides:` applied last. The projection
      is **sparse** — a filled range stays a range and `cellAt` answers for the
      cells it covers (**ADR-019**), because `at: D2:D1048576` is two words in a
      spec and would be a million objects here.
- [x] Per-facet provenance for value and format (§4.3)
      **Shipped**: `literal`, `inline`, `defRef`, `param`, `formulaRange`, and
      `override` are all produced and tested. `external` waits for the reader
      below; the style layers wait for the item below that.
- [x] Style resolution as an ordered layer list — workbook default, column band,
      row band, named style (with `extends:` chains), inline, override — each
      layer recording only what it contributed
      **Shipped**, minus the workbook default, which waits for `default_font` to
      be modeled at all. A layer says both what holds the properties and *how it
      reaches* the cell — a column band naming `header` gives the definition's
      layers `through: 'column'` — because those are the two different answers
      §4.4 has to offer. Asked by address rather than by cell (`styleAt`), since
      a band reaches the cells in its span whether a spec wrote them or not.
- [x] `params` substitution recorded as `param` provenance, not flattened away
      **Shipped**, following `docs/spec.md` §7 exactly: `$$` is a literal `$`, a
      value that is *exactly* one placeholder keeps the parameter's type, a
      default may name another parameter, and a cycle stops at the text as
      written. A placeholder nothing declares is left standing in the value and
      reported — a grid drawn from a half-written spec should show `${region}`
      where the value will be, not a blank.
- [x] Editability classification derived from origins (§4.3)
      **Shipped** as two functions over an origin and a style layer — no stored
      field, because the class is a fact about where a facet came from and
      storing it would be a second copy to keep true (ADR-006). A definition is
      `mediated` however it was reached; what the cell itself wrote is `direct`,
      including a cell that carries only a look, since adding `value:` to a
      mapping that exists is one change to one node.
- [x] Impact estimation: given a definition node, which cells does it reach
      **Shipped** as `reaches(grid, node)`, over values, formats, and style
      layers alike — so it counts the base of an `extends:` chain and a band's
      cells, not only a direct `$ref`. It answers for the cells the projection
      *holds*: a band also reaches every empty address in its span, which no
      diff of two projections could show, and the band itself is the honest way
      to say "and the rest of column B".
- [x] Read `csv:` and `json:` `data:` through an injected reader, as `$include`
      already is, and record the cells as `external` provenance
      **Shipped**, and with it **every upstream spec now compiles with no
      diagnostics at all** — the CSV and JSON parsers meet real files on every
      commit rather than only fixtures. A `data:` path resolves against the spec
      that was opened, not against the file the block was written in
      (`docs/spec.md` §9), which is the one place it differs from `$include`.

### Phase 4 — Read-only preview  ← **first release**
The design note's judgement was that this alone solves most of the problem, and
that judgement holds: seeing the workbook while editing the text is most of the
value, and it carries none of the write-back risk.
- [x] A VS Code **preview beside the text editor** for `*.yxl.yaml`
      **Shipped**, and not as a custom editor — **ADR-020**. The text stays in
      its own editor and the projection sits next to it, which is what §1 says
      the relationship is. A custom editor arrives when the grid can be edited
      (Phase 6), and it will reuse everything here.
- [x] Grid rendering: values, formulas as text, styles, merges, column widths,
      row heights, multiple sheets (grid library choice — §8 Q5)
      **Shipped on a plain table**, which is the answer §8 Q5 asked for: measure
      first, then choose. A read-only preview needs no cell editor and no
      spreadsheet model, so the library question is only about size and speed,
      and neither has been measured yet. A number format is *not* applied yet —
      the value shows as the spec wrote it — which is its own item below.
- [x] Provenance inspector: select a cell, see where each facet came from,
      property by property
      **Shipped.** Click a cell and the panel says where its value came from,
      where its format came from, and — per style property — which layer
      supplied it. Every line that names a node is a link into the file it lives
      in, which is half the jump below.
- [x] **Bidirectional jump**: grid cell → the YAML node that produced it, and
      cursor in YAML → the cells it produces (highlighted). This is the feature
      that makes the release worth shipping.
      **Shipped, both ways.** An inspector line takes you to the node in
      whichever file it lives; putting the cursor in a node highlights every
      cell it reaches and says how many, so a cursor on `defs.styles.header`
      lights up the cells wearing it. The innermost node wins, since a cursor
      sits inside every span that holds it.
- [x] Diagnostics from the loader shown inline in the grid and as VS Code
      problems
      **Shipped, both.** A diagnostic marks the cells it is *about* — the node
      at its span is the cause, and the cells that node reaches are where the
      effect shows — and the list under the grid takes you to the line. One that
      reaches no cell stays in the list, which is where a bad band selector
      belongs.
- [x] `yxl build` / `--check` invoked as commands, output surfaced, binary
      discovery and a clear message when it is missing
      **Shipped**, and §8 Q6's open half is answered with it: the compiler is
      **required, not bundled**. `yxl.path` names it, a bare name is looked up
      on `PATH`, and a missing one is a message with the install link rather
      than a mystery. The version is checked once a session and warned about in
      both directions, never refused.
- [x] Live re-projection on text edit, debounced
      **Shipped**: 150ms after the last keystroke, and on any *other* file being
      saved, since an `$include` or a `csv:` this spec reads may be what
      changed.
- [x] `params` switcher, so one spec previews as several workbooks
      **Shipped** as a box per declared parameter above the grid. A value typed
      there is read the way `--set` reads one — `0.15` stays a number — and
      emptying the box gives the parameter back to the spec's own default.
      Nothing is written to the file: it changes what is *drawn*.
- [x] Apply number formats when drawing a value: a spec writes `0.085` with
      `format: "0.0%"` and Excel shows `8.5%`
      **Shipped** through `numfmt` (**ADR-022**), including Excel's own rule
      that an *inherited* format does not apply to a text cell. A date or a
      duration still shows as the text the spec wrote — see below.
- [x] Show a `type: date` and a `type: duration` under their format
      **Shipped**: `compile` turns each into the number Excel keeps and gives it
      the format its type takes, so `dd/mm/yyyy` on a date now draws as a reader
      would expect. `date1904:` is **modeled** rather than carried, because the
      two epochs are four years apart and guessing would draw every date in such
      a workbook wrong.
- [x] A DOM environment for the view's own tests (jsdom or happy-dom, with the
      licence check §9 requires)
      **Shipped**: jsdom 30 (MIT, checked at the registry), turned on for that
      one test file with `@vitest-environment` rather than for the suite — 19
      tests, and the rest of the project keeps running without a DOM. jsdom
      over happy-dom because these tests assert what CSS the drawing produced,
      and a faithful CSSOM is the whole point of asking.
- [x] Measure the preview against a deliberately large spec (§9 R5), and answer
      §8 Q5 with the number rather than the guess
      **Measured**: 100 000 written cells — 738KB of YAML — parse in 353ms, load
      in 5ms, compile in 27ms, and flatten in 52ms. The projection is not the
      cost; **parsing is**, and the DOM would have been. So the preview draws a
      page of a sheet (200 rows × 50 columns) and says what it left out, and §8
      Q5 is answered: no grid library.
- [x] Draw more of a large sheet than the first page — a window that follows the
      scroll, rather than a cap. The cap is honest and cheap and makes the first
      release usable; this is what makes it good.
      **Done**: the same 200 × 50 window, drawn wherever the reader is rather
      than only at the top left. The view pads the rows and columns the window
      leaves out so the scrollbar spans the whole sheet, and asks for another
      window on nearing an edge of the drawn one; the host answers from the grid
      it already compiled, so scrolling costs a redraw and not a re-parse.
- [x] **The session identity map** (ADR-015), moved here from Phase 2. A
      `NodeId` is positional, so inserting an item into a sequence gives every
      item after it a new one — and gives the old id to the item next door. That
      costs nothing until something holds an id *across* a re-read, and the
      first thing that does is this phase's UI, which is also where §8 Q3 asks
      whether losing selection state on reload is acceptable at all. The two
      questions are the same question, and deciding them together, with a real
      consumer in view, beats deciding either blind. `id.test.ts` pins today's
      behaviour, so the day this lands, that test is what changes.
      **Decided (ADR-023): no map.** With the consumer built, it holds no ids —
      it keeps a sheet by name, a cell by address, a parameter by name. What the
      decision cost was making that true rather than accidental: the showing tab
      and the scroll window were keyed by *position* and are now keyed by name,
      the wire names sheets, and a test asserts no id reaches the view.
      `id.test.ts` is unchanged, because identity is unchanged.

- [x] **Draw `rich:` cells.** A cell of mixed-font runs loads and compiles, and
      then the drawing drops it: `DrawnCell` has no runs, so the preview shows an
      empty cell where the workbook will hold text. Found by looking at
      `styling.yxl.yaml` in the preview. The runs carry a font each, which is the
      same flat style vocabulary the view already wears — the gap is the wire,
      not the model.
      **Shipped**: a run compiles to its text and the flat leaves of its own
      font — the same vocabulary a style layer speaks, so the view draws a run
      the way it draws a cell — and the cell is drawn as one `<span>` per run.

### Phase 5 — Evaluated preview
- [x] `evaluate` seam: `CompiledGrid` → computed values, display only
      **Shipped**: two calls — here is what the workbook holds, what does this
      formula come to — and everything else is the seam's, because it is about
      the spec rather than about arithmetic: which cells to ask about, a range
      asked cell by cell with its offset, and passes until the answers settle.
- [x] Adapter over `@univerjs/engine-formula` (Apache-2.0 — ADR-013)
      **Shipped** (ADR-025), and *synchronously*: the layer under Univer's own
      entry points needs no live workbook and answers in the same tick, so the
      projection is still a function over text.
- [x] Cells show the computed value with the formula available; an evaluation
      failure degrades to showing the formula, never to a wrong number
      **Shipped**: the computed value rides beside the spec's own rather than
      over it, so what an edit could be about and what a reader is looking at
      stay different fields (ADR-014).
- [x] Unsupported-function reporting, so the gap between us and Excel is visible
      rather than silent
      **Shipped**, and it turned out to be the *load-bearing* half rather than a
      nicety — see §11. What a formula names and the engine has nothing behind
      is what the preview cannot compute, and the sheet says so under the grid.
- [x] The evaluated value is unreachable from every write path — asserted, not
      assumed
      **Asserted** as far as there is anything to assert against: the computed
      value rides in a field of its own on the wire and the spec's `value` is
      tested to be untouched by it. The gate that matters arrives with Phase 6,
      where there is a write path to keep it out of.

### Phase 6 — `direct` write-back
The first phase where the file changes. Scope is deliberately the subset where
the inverse is unique, so no dialog is needed yet.
- [x] `patch` + inverse ops; AST-level undo/redo
      **Shipped**, with the rule that fell out of building it (**ADR-026**): a
      patch whose inverse cannot be expressed is *not applied*. The inverse is
      read against the file as it stands before the edit — the only moment the
      old text is still there — and it puts back **text**, not a value, which is
      what makes an undo byte-exact. Two ops were missing from the algebra
      (`add` an entry, `clear` a value) and one was new (`write` the bytes back).
- [x] `verify` loop wired in front of every apply (ADR-009)
      **Shipped**, and *wired* structurally rather than by discipline: `checked`
      is the only export in the tree that writes a spec, and it compiles before,
      applies, compiles after, and compares what moved against the patch's own
      claim. Three verdicts — applied, ask about the surprises, refused — and the
      refactor case (a claim of *nothing changes*) is the one where a single
      surprised cell is a refusal.
- [x] `setValue` / `setFormula` on `literal` and `inline` origins
      **Shipped, and the file changes**: double-click a cell, type, Enter. The
      gesture becomes an `intent` — one node of the spec, or a refusal naming
      what stands in the way — the checker gates it, and the edit lands in
      whichever *file* wrote the cell, `$include`d or not. A leading `=` makes it
      a formula, as it does in Excel. The way in is a spreadsheet's: Enter, F2,
      a double-click, or simply typing; Enter commits and moves down.
- [x] `overrides:` as an explicit escape hatch, with the "manually edited" badge
      and the optional `reason:` — writing the construct yxl v0.3.4 shipped
      (`docs/spec.md` §23), which Phase 2 already reads
      **Shipped**: every refusal that is about a real cell now carries the way
      out — a box to say why, and *Write it as an override* — which writes the
      entry (creating `overrides:` where the spec has none) and marks the cell.
      Never taken on its own: an escape hatch that opens by itself is the door.
- [x] Everything not `direct` is visibly, explainedly read-only — the editor is
      honest about what it cannot yet do
      **Shipped**: a cell one node of the spec does not write carries a grey
      corner, says which of the two things stands in its way on hover, and says
      it in full when selected — with the way out named. The badge comes from
      `editabilityOf`, the same rule the write path refuses by, so the two can
      never disagree.
- [x] Prove ADR-011's preservation half: load a spec that uses opaque constructs,
      write an edit through `patch`, and assert every opaque region came back
      byte for byte. Owed from Phase 2, which could mark the constructs but had
      no writer to test them against.
      **Proved**, over yxl's own examples and real constructs — charts, pivots,
      validations, sparklines, shapes, print setup, protection. The suite also
      checks that a key the loader stops reading cannot fall through unmarked,
      and that seven specs actually have both halves, so it cannot pass by
      skipping.
- [x] Rewrite a block scalar. `set` over a `|` or `>` value is refused today:
      its span is the indented body, so writing a plain scalar over it would
      take the lines under it too. Doing it properly means keeping the
      indicator, the indentation, and the chomping — and `summary.yaml` writes a
      formula that way, so this is a real spec's real edit.
      **Shipped**: the header line and the chomping are outside what is
      rewritten, and the new text is indented to where the body already sits.
      The Tier 2 round trip covers block scalars again, which is where the
      byte-for-byte undo is proved.
- [ ] Put back an entry that holds more than a scalar. `remove` of
      `A1: { value: 1, style: header }` has no inverse in this algebra, so it is
      refused (ADR-026); a structural edit needs one that can carry a subtree.
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

*Status:* ✅ **it exists.** Requested upstream as
[yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) rather than invented here —
a spec this editor writes must compile with a stock `yxl` (ADR-011) — and
**shipped in yxl v0.3.4** as `docs/spec.md` §23. The `cells:` fallback this ADR
was designed to fall back on is no longer needed.

What shipped is the proposal with its edges tightened, and the tightenings are
the resolver's to respect:

- `at:` is **sheet-qualified** — `Sales!E37`, or `'Q3 data'!A1` where Excel
  would quote the name. Never a range. So this project needs a qualified-address
  unit alongside `A1Addr`.
- **An override must have something to override.** A spec whose override lands
  where no `cells:`, `data:`, or `formulas:` entry writes is refused: an
  exception to nothing is a `cells:` entry with a misleading name.
- **One cell, one override** — a second entry for the same cell is refused
  rather than resolved by order.
- Inside a filled range an override may land anywhere **but the top-left**,
  which is where the shared formula is stored; it takes that one cell out of the
  range and leaves the range whole. This is the case §4.4's `formulaRange` row
  had no good answer for.

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

### ADR-018 — The oracle is the compiler's CLI, and conformance is one-directional
**Accepted.** Revises **how** ADR-012 is implemented; ADR-012's decision —
differential conformance against the MoonBit core, in tests only — stands.

Two things came out of building it.

*The JS target has no library surface.* `moon build --target js` emits a
**program**: `main.js` runs `main()` and exits, and the `main.d.ts` beside it
declares nothing. ADR-002 measured that the whole pipeline *runs* on the JS
target, which is true and still useful, but "the real loader runs in-process"
needs an exported API that does not exist. Adding one is an upstream change this
project does not need, because the compiler already ships a **released binary
per platform** and `yxl build --check` is the validator of record (ADR-011). So
the oracle is the pinned release, run as a subprocess, and CI takes it from the
release rather than building it — no MoonBit toolchain in this repo's CI, and
the thing being asked is the artifact users actually run.

*"The two agree" cannot mean "the same verdict".* ADR-011 has this editor
validate only what projection requires, so the compiler will always refuse specs
we happily read. Conformance is therefore stated in one direction plus a list:

- **Anything this editor refuses, the compiler refuses too.** Being the stricter
  of the two is the failure a user feels — an editor that will not open a file
  that builds — and it is exactly what a second implementation of a schema
  produces when it drifts.
- **The other direction is enumerated, not asserted equal.** A corpus of specs
  the compiler refuses and we deliberately carry (an undefined style name, a
  sheet name Excel would refuse, an unknown top-level key) pins the gap ADR-011
  opens, so it is measured rather than claimed, and so that closing part of it
  later is a visible change.

*What this does not cover:* the two **models**, compared structurally. Nothing
here proves that a cell we read as the number `7` is the number `7` to yxl —
only that we agree about which files are specs. Closing that would take a
machine-readable model dump from the compiler (an upstream ask) or a comparison
through `yxl extract`'s output (lossy, §22). Neither is worth building until the
two disagree in a way a verdict cannot catch; §9 R1 carries the residue.

### ADR-019 — The projection is sparse; a filled range stays a range
**Accepted.** `CompiledGrid` holds what a spec *wrote*: the cells it names, the
`formulas:` ranges as ranges, and the bands as bands. `cellAt(sheet, addr)`
answers for an address by consulting the written cells first and the ranges
after, so no consumer has to know which of them holds the one it asked about.

*Why:* `at: D2:D1048576` is two words in a spec and one stored formula in the
workbook (ECMA-376's shared formula, which is the construct's whole point). A
projection that multiplied it out would turn a small file into a million objects
before the grid drew a single row, and would do it again on every keystroke
(§9 R5). Bands are the same shape of problem — one line reaching a whole column
— and get the same answer.

*The consequence worth naming:* provenance for a cell inside a range is computed
when it is asked for rather than stored, which is why `FacetOrigin`'s
`formulaRange` carries the anchor and the offset instead of a per-cell node.
A written cell wins over a range it sits inside, which is exactly what makes an
`overrides:` entry able to take one row out of a filled column (`docs/spec.md`
§23, ADR-007) without the range losing its shape.

### ADR-020 — The preview is a panel beside the text, not a custom editor
**Accepted.** `yxl: Open Preview to the Side` opens a webview panel next to the
document. The file stays a YAML file in an ordinary YAML editor.

*Why:* §1's premise is that the text is the truth and the grid is a projection
of it. A `CustomTextEditor` *replaces* the text editor for that file, which
states the opposite relationship — and states it at the moment the editor can do
least, since nothing is editable yet. The preview also wants both open at once
to be worth anything: the feature that makes this release (§6 Phase 4) is seeing
the workbook while editing the spec.

*What it costs:* when the grid becomes editable (Phase 6), a custom editor is
the right shape and this becomes a second entry point rather than the only one.
That is a `contributes` block and a class that owns a `TextDocument`; everything
below — projecting, drawing, the message shape — is reused as it stands.

### ADR-021 — The extension bundles with esbuild
**Accepted.** `packages/extension/build.mjs` produces two bundles: the extension
host's, as CommonJS with `vscode` external, and the view's, as an IIFE for the
browser. `@types/vscode` and `esbuild` are the only new development
dependencies (both MIT, checked at the registry rather than recalled).

*Why esbuild:* a VS Code extension ships as one file, so something must bundle;
esbuild is what the VS Code samples and most extensions use, it is one
dependency with no plugin graph, and it builds this tree in under a second.
Rollup and webpack would both do the job and cost more configuration.

*One thing it made explicit:* pnpm 11 refuses to run a dependency's install
script unless it is named, and esbuild has one — it unpacks a platform binary.
`pnpm-workspace.yaml` names it, which is the right default holding: a build
script is arbitrary code from a dependency, and the file now says which one this
project has agreed to run.

### ADR-022 — Number formats are applied by `numfmt`
**Accepted.** The view renders a number under its format code with
[`numfmt`](https://github.com/borgar/numfmt) 3.2.6 — MIT, no dependencies,
maintained (last published 2026-04), all checked at the registry and in the
package's own `LICENSE` rather than recalled.

*Why a library at all:* an Excel format code is a small language — four
sections, `0`/`#`/`?` placeholders, thousands and percent, quoted literals,
date and `[h]` elapsed codes, `[Red]` colours, `[>100]` conditions. A subset
would draw *wrong numbers* for anything outside it, and this project has already
learned the price of that: the filled-formula bug (§11) was exactly a preview
showing something false rather than something less.

*Where:* in the view, which is where drawing decisions belong. The wire carries
the value and the pattern; the host decides *which* pattern applies, since that
needs the style layers (Excel does not apply an inherited format to a text cell,
`docs/spec.md` §4).

*What it costs:* the view's bundle goes from 7KB to 120KB. It is loaded once,
from disk, inside a webview — the same trade a syntax highlighter makes.

*What it does not fix:* a `type: date` or `type: duration` is still drawn as the
text the spec wrote, because this projection never converts either to an Excel
serial. That is `compile`'s to do and is now an item of its own.

### ADR-023 — The UI keeps its place by name, not by node id
**Accepted.** What the preview holds across a re-read is what the reader
*pointed at*: a sheet by its name, a cell by its A1 address, a parameter by its
name. No `NodeId` crosses the wire, and none is kept anywhere.

*Why this and not the session identity map:* ADR-015 left a map open because a
`NodeId` is positional — inserting an item gives every item after it a new id,
and hands the old id to the item next door. The map was to survive that. With
the real consumer built, the premise turned out not to hold: **the UI never held
an id in the first place.** Selection is an address, the scroll window is a row
and a column, the tabs are sheets, the parameter boxes are names. Every one of
those is a *natural key* the reader chose, and every one of them means the same
thing in the next read. A map from old ids to new ones would have been
machinery for a consumer that does not exist.

*What it cost to make true:* two keys were positional and are now names — the
showing tab and the per-sheet scroll window — so a sheet inserted before them no
longer moves the reader somewhere else silently. The wire names sheets too,
which also settles a race: an answer computed after a re-read is about the sheet
that was asked about, or about none.

*What is left, and is not identity:* a span is an offset into the text it was
read from, so the cursor is not answered from a read older than the document —
it says nothing until the read catches up. That is a *version* check, one number
per projection, and not a map.

*What would reopen this:* a write path that has to name a node across a re-read
— "the band the dialog is about" while the file changes underneath — is Phase 6
and later, and the natural keys above may not reach it. Then this decision is
the thing to supersede, with a consumer to check the choice against, which is
what was missing both times before.

### ADR-024 — The sheet is drawn as a workbook, not as a panel
**Accepted.** The grid is painted white with black text and Excel's own gridline
grey, in every editor theme. Everything around it — the tabs, the parameter
boxes, the inspector, the problem list — keeps VS Code's theme.

*Why:* a spec's colours are the *workbook's* colours, and the preview's one job
is to say what Excel will show. On a dark surface it says something else: an
unfilled cell reads dark where the workbook is white, a light fill loses the
contrast it was chosen for, and `font: { color: "000000" }` — black, the most
ordinary colour a spec can name — is invisible here and perfectly legible there.
That is the preview showing something *false* rather than something less, which
is the failure this project has already paid for once (the filled-formula
formula, §11).

*What it costs:* a white rectangle in a dark editor. That is a real cost and it
is the point — the sheet is a different kind of thing from the panel it sits in,
and looking like one is honest. Excel 365's own dark canvas is opt-in and
inverts only *automatic* colours, which a spec's explicit colours are not, so
matching the theme would not even match a dark-mode Excel.

*What would reopen this:* a reader who wants the dark canvas, at which point it
is a setting with two values, not a different default. Nobody has asked.

### ADR-025 — The engine is driven under its own API, and given fresh ids each load
**Accepted.** `@univerjs/engine-formula` is used through its lexer, parser, and
interpreter directly rather than through `CalculateFormulaService.execute` or
`executeFormulas`, and every load of the workbook's values is registered under
new sheet ids.

*Why not the documented entry points:* both of them read the workbook from a
live Univer instance — `loadDataLite()` fetches the sheets from the instance
service and overwrites whatever was registered — so using them would mean
standing up a real workbook model, a document, and the plugins under it. They
are also `async`. The layer beneath them takes the cell values it is handed and
answers in the same tick, which is what keeps `project` a synchronous function
over text.

*Why fresh ids:* the engine caches a materialised range in a **process-wide LRU
keyed by unit, sheet, and position, with nothing in the key about the values it
holds**. Reading `A1:A2` once would otherwise freeze it for every later pass and
every later preview in the process — measured, not guessed: a second pass read
the first pass's blanks. New ids per load are new keys, and the LRU evicts the
old ones.

*What it costs:* the extension bundle goes from 365KB to 3.3MB. The webview's is
unchanged, because the wire carries the engine's *answers* and the type that
names them is erased at build time.

*What it does not do:* no dependency graph. Univer's would come with the
workbook model this deliberately avoids, so the order is `evaluate`'s own — a
pass per depth of chain, and a cell that never settles is reported as
uncomputable rather than as the number it stopped at. The same absence is why
doubt is tracked **by sheet** rather than by cell: without the graph there is no
way to say which totals a `#NAME?` reached, and a sheet is the unit a reader
looks at anyway.

### ADR-026 — An edit that cannot be undone is not made
**Accepted.** `applyPatch` works out the inverse *first*, against the file as it
stands, and applies nothing if it cannot express one.

*Why:* the alternative is a history with holes in it — an editor where undo
sometimes works, and the reader has to remember which edits were the kind that
stick. A refusal is a sentence the UI can say and a bug report someone can file;
a missing undo is neither.

*What it costs:* edits this algebra cannot yet reverse are unavailable, and each
one is now a roadmap item rather than a surprise — removing a cell written in
its expanded form, and rewriting a block scalar.

*What it makes true:* the inverse puts back **text**, not a value. `1.50` and
`1.5` are one value and two files; a tab written raw inside quotes and one
written `\t` are the same string and not the same file. An undo that reformatted
either would be an edit nobody asked for, so the CST now carries the bytes a
scalar was written as, and the `write` op puts exactly those back.

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
- **Q3 — External change detection.** ✅ *Answered 2026-08-15 (ADR-023).* Discard
  the AST and re-derive — and there is no selection state to lose, because what
  the UI keeps is names and addresses rather than nodes. The one thing that
  cannot outlive a read is a *span*, so the cursor is not answered from a read
  older than the document. ADR-015's identity map, asked from the other side,
  goes with it: there was no consumer holding an id.
- **Q4 — Where do new nodes go, across `$include`?** Provenance names the source
  file for existing nodes, but an addition has no file yet. Working assumption:
  the file backing the sheet being edited, shown in the resolution dialog so it
  is never a surprise. Confirm in Phase 6.
- **Q5 — Grid UI.** ✅ **Answered, with the measurement: no library.** Phase 4
  draws the grid as an ordinary HTML table with the styles resolved by
  `compile`, and the numbers say that is enough. Over a spec of **100 000
  written cells** (738KB of YAML): parse 353ms, load 5ms, compile 27ms, flatten
  every address in the box 52ms. The projection is not the cost — **parsing
  is** — and the one cost that would not have survived that size is the DOM,
  which is answered by drawing a page at a time rather than by a library.

  A library would bring a spreadsheet model of its own, which fights ADR-001's
  "the grid holds no state", to solve a problem measurement says we do not have.
  Revisit when editing arrives (Phase 6) and the requirements change, not
  before. `tests/scale.test.ts` keeps the numbers honest: its ceilings are ten
  times the measurement, so the day something turns linear work quadratic, it
  fails.

  The original framing follows, and still governs the day editing arrives.

  Requirements are unusual: per-cell editability control,
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

  ✅ **Answered in Phase 4: required, not bundled.** The `yxl.path` setting names
  the compiler; a bare name is looked up on `PATH`. Bundling would mean shipping
  a binary per platform, owning its update cadence, and publishing a `.vsix` per
  target — for users who already have yxl, since the thing being previewed is
  its input. A missing compiler is a message with the install link, which is the
  whole of what bundling would have bought. If that proves wrong, an optional
  download is a smaller change than a bundle would have been to undo.
- **Q7 — The JSON Schema.** yxl's Phase 11 has an unchecked item: publish a JSON
  Schema generated from `docs/spec.md`. That artifact would serve this editor's
  loader directly. Worth building **upstream in yxl** rather than here, and worth
  offering to do — it is one artifact serving both, and generating it there keeps
  it honest against the reference.
- **Q8 — Tauri.** Phase 11. Nothing in the architecture blocks it (ADR-004); the
  question is whether the demand exists.
- **Q9 — `overrides:` must exist upstream.** ✅ **Answered: it does.** Filed as
  [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) (2026-08-14) and shipped
  in **yxl v0.3.4** (2026-08-15) as `docs/spec.md` §23, close to the shape
  ADR-007 asked for and with its edges tightened — see the ADR for the four
  rules the resolver has to respect. The fallback design (a `cells:` write
  relying on last-wins key order) is retired; Phase 6 builds on the real thing.

  Worth keeping for the next time this comes up: the request went in as "add a
  capability" and turned out to be "name an intent". yxl could already express
  every one of the three hard cases through documented key order — what it could
  not express was that a cell *is* an exception, which is what makes overrides
  countable, explainable, and foldable.
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

  *Partly unmitigated, as of ADR-018.* Tier 3 compares **verdicts**, not models:
  it catches a spec we read that the compiler will not build, and it does not
  catch reading a value differently from the way the compiler reads it — a
  quoted `"007"` becoming the number seven would pass every test here. Nothing
  cheap closes that today, so the honest statement is that the largest risk is
  bounded on one side and watched on the other. Reach for a model dump upstream
  the first time a defect of that shape appears.
- **R2 — CST write-back is harder than it looks.** Comment attachment, block
  scalars, flow collections, anchors. The library itself documents instability
  around trailing comments. Mitigated by putting it in Phase 1 with a byte-
  identity gate, so it fails early and cheaply rather than in Phase 6.
- **R3 — The resolution dialog is annoying.** If routine edits ask questions, the
  product is worse than editing YAML. Mitigations: `direct` origins never ask
  (which is why Phase 6 exists as its own phase), a remembered choice per
  origin-kind, and honest measurement of the ask rate during Phase 7. If it
  cannot get low, that is a finding about the design, not a UX tweak.
- **R4 — Scope.** `docs/spec.md` is 1451 lines across 23 sections. ADR-011 makes
  coverage incremental, but "editable in the GUI" will lag "expressible in yxl"
  for a long time, and the README must say so plainly rather than imply parity.
- **R5 — Webview performance.** ✅ *Closed 2026-08-15* — measured, then answered.
  100 000 written cells parse in 353ms, load in 5ms, compile in 27ms and flatten
  in 52ms; the one cost that did not survive that size was the DOM. So the view
  draws a 200 × 50 window wherever the reader is and pads out the rest, the host
  answers a scroll from the grid it already compiled, and a keystroke is
  debounced. What is left of this risk is ordinary: a *keystroke* still re-parses
  the whole spec, which is why incremental compilation keyed by node stays on the
  list rather than in the closed column.
- **R6 — Evaluation disagrees with Excel.** Any preview engine will differ from
  Excel somewhere. Mitigated by ADR-014 (never written back), visible
  unsupported-function reporting, and "Excel is the renderer of record" stated in
  the UI, not just here.
- **R7 — The upstream dependency (§8 Q9).** ✅ *Closed 2026-08-15* — `overrides:`
  shipped in yxl v0.3.4, so there is no dependency left to carry. Kept here for
  what it says about the shape of this project's risks: the one that looked
  structural was a *coordination* risk, and it was retired by writing the request
  down carefully rather than by building anything. The history below is what it
  was.

  *Downgraded 2026-08-14.* Filing
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

### 2026-08-15 — Phase 2: the SpecDoc AST, and the units under it
- `spec` holds the AST for the core subset and `units` the branded types it is
  written in. Both were empty packages until now. 39 new tests, 281 in total.
- Every key, value form, and vocabulary was **read out of yxl's loader**, not
  recalled: `src/loader/{cell,style,axis,data,defs}.mbt` and `src/units`. Two
  things that reading found, which `docs/spec.md` does not say — a colour may be
  eight hex digits with an optional `#`, and a row may be padded (`A01`) — are
  accepted here for the reason in ADR-011: refusing what the compiler accepts
  would leave this editor unable to open a spec that builds.
- **Placeholders are not substituted away.** `Templated<T>` is `T` or the raw
  `${...}` text, and appears wherever a parameter can stand in for something
  this AST would otherwise have parsed — an address, a name, a colour, a path.
  Phase 3 substitutes and records it as `param` provenance; flattening it here
  would have destroyed exactly what makes a parameterized cell editable.
- **`Sheet.keyOrder` records the order the sheet's keys were written in.** Sheet
  keys apply in that order (`docs/spec.md` §2), so a `cells:` entry after a
  `data:` block wins — the same rule ADR-007's fallback leans on. Split into one
  list per construct, the AST would have lost it, and spans cannot recover it
  across an `$include`.
- **A style's border is an ordered list of sides, not four slots.** yxl applies
  the keys as written, so `all` after `left` replaces that `left`. Four named
  slots would have been the tidier type and would have quietly disagreed with
  the compiler on any spec that wrote them in that order — a Tier 3 failure
  waiting to happen, and the conformance rule (ADR-012) is that we match yxl
  even where our answer looks better.
- Colours are kept **as the spec spelled them**, case and `#` included. yxl
  canonicalizes on the way into a workbook; an editor that writes specs back
  must not change a value it was not asked to change.
- Not done here, deliberately: `Opaque` exists as a type but nothing produces
  one yet (that is this phase's preservation item), no `NodeId` can be
  constructed yet (its derivation is its own item), and the corpus test that
  would check these key sets against real specs waits for the loader — writing
  a walker in the test to get it sooner would be writing the loader twice.

### 2026-08-15 — Phase 2: the loader, and what the corpus said about it
- `loader` reads a parsed file into a `SpecDoc`: sheets, cells, filled formula
  ranges, data blocks, bands, merges, `defs`, `params`, and an `Opaque` node for
  every document or sheet key this editor does not model. 115 new tests, 396 in
  total.
- **The corpus is the real test.** Every one of yxl's example specs loads with no
  diagnostic other than `loader.include-not-expanded`, over specs upstream
  compiles on every commit. Any other code would mean a key, a value form, or a
  vocabulary was misread — which is a sharper instrument than any unit test here,
  and it is what stands in for Tier 3 until the oracle is built. A second
  assertion checks the corpus actually exercises each construct, so the first
  cannot pass on a loader that reads nothing.
- **A reader reports and carries on.** A spec is wrong most of the time it is
  being edited; a loader that stopped at the first half-typed key would blank the
  grid on every keystroke. So a bad address costs one cell, not the sheet, and a
  document always comes back when the root is a mapping.
- The line ADR-011 draws turned out to be sharper than "unknown keys are
  carried": a key at the **document or sheet** level is a construct we have not
  modeled yet, so it becomes `Opaque`; a key inside a **cell, style, band, or
  data block** is a mistake, because those are modeled completely, so it is a
  diagnostic — with the expected keys listed from `MODELED_KEYS`, so what a
  reader accepts and what it says it accepts cannot drift.
- **`Style` stopped being a node.** A definition's entry and the style it binds
  share a path, so both deriving an id from it collided. A style is a value now,
  and the node is whatever holds it — a definition, a cell, a band — which is
  also what an edit addresses. Finding this is why the AST and the loader were
  worth doing in that order.
- An `$include` is reported where it stands rather than read as the construct it
  replaced, so `modular.yxl.yaml` says one clear thing instead of a dozen about
  missing keys. The next item replaces the diagnostic with expansion.

### 2026-08-15 — Phase 2: `$include`, and what a node's address really is
- The loader follows an `$include` through an injected reader (ADR-004): the
  core says *which* file it wants, and the shell decides what a path means and
  whether it can be read. 17 new tests, 419 in total.
- **It was not a pass over the tree, it was a change to what a reader is given.**
  An include replaces its whole node, so the file *and* the path change in the
  middle of a walk. A reader now works on a **site** — a node, the file it was
  written in, and its path within that file — and every construct opens through
  one of two functions, which is what makes includes work in all the places the
  schema allows them without a case for each.
- **A `NodeId` carries the file.** Without it, the first sheet of an included
  file and of the file that included it are both `sheets/0`. The path restarts at
  each included root for the same reason an edit does: a node from `theme.yaml`
  is patched in `theme.yaml`, at its own path.
- **The corpus test got its teeth.** With a filesystem reader supplied from
  `tests/` — where I/O is allowed — every upstream spec now loads with **no
  diagnostics at all**, `modular.yxl.yaml` included. Before this it was "none
  except includes"; now there is no exception left to argue about.
- Reading one file alone is still legitimate: with no reader, an include reports
  that it was not expanded rather than being read as the construct it stands in
  for.
- A cycle names the whole loop (`a → b → a`), which is what makes the error
  actionable. It is checked against the chain of files followed, so a file
  included twice by different parents is fine and only a loop is not.
- Biome's `noTemplateCurlyInString` is **off**: `${...}` in a string is a yxl
  parameter placeholder in this codebase — spec data, in the loader and in its
  tests — and the rule fires on every one of them. Twelve suppression comments
  would have been the alternative.

### 2026-08-15 — Phase 2: reading `overrides:`
- The loader reads the construct yxl v0.3.4 shipped: a top-level list, each
  entry a sheet-qualified cell, the facets it replaces, and an optional
  `reason:`. 22 new tests, 441 in total.
- **A cell and an override write the same six facets**, so they share one reader
  and one `CellFacets` type. Upstream made the same call in the same week —
  their cell grammar is now stated once so an override can borrow it — and the
  reason is the same on both sides: two lists of the same six keys drift.
- **`QualifiedAddr` is a record, not a brand.** `Sales!E37` is two values, and a
  reader that kept the text would only have to split it again. Excel's quoted
  form comes with it (`'Q3 data'!A1`, an inner apostrophe doubled), unquoted at
  the edge so the sheet name compares equal to the sheet's own.
- **What an override may land on is not checked here.** A declared sheet, one
  override per cell, something to override, and not the anchor of a filled
  range — every one of those needs the whole workbook in view, which is
  `compile`'s, not a file reader's. Reading and validating are different jobs
  and this is where the line falls (ADR-011).
- Not covered by the corpus: yxl's `examples/` has no spec using `overrides:`
  yet, so this construct is held by unit tests alone until one appears. Asked
  for upstream as [yxl#68](https://github.com/t-ujiie-g/yxl/issues/68) — §23 is
  the only section of the reference with no worked example behind it, which
  means its compile path is not exercised there either.

### 2026-08-15 — Phase 4: a date is a number wearing a format
- `compile` turns a `type: date` into the serial Excel keeps and a
  `type: duration` into a fraction of a day, each with the format its type takes
  when the spec wrote none. Before this a date could not wear a format at all —
  the value was text, and text does not take a number format. 18 new tests, 685
  in total.
- **`date1904:` is modeled now, not carried.** The two epochs are four years and
  a day apart, so a projection that assumed one would draw every date in a
  workbook that chose the other four years wrong — silently. It is the second
  document key to earn modelling by changing what a value *is*.
- **Excel's leap-year bug is carried on purpose**: it counts a 1900-02-29 that
  never happened, so every date from 1900-03-01 is numbered one higher.
  Leaving it out would put every modern date one day early. The test names the
  two serials either side of it, so the next reader knows it is deliberate.
- A cell's own format — written, or the one its type takes — now wins over a
  band's. Both are requests about *that* cell; a band is something reaching it.

### 2026-08-16 — Phase 6: writing into a folded formula

- **A `|` or `>` value can be written into now.** What is replaced is the body
  alone: the indicator, the block's chomping, and the key's line sit outside it
  and are never touched, and the new text is indented to where the body already
  sits — a line that came back shallower would close the block early and take
  the rest of the mapping with it.
- **The value is written as text, not rendered.** Quoting a scalar inside a
  block scalar would put the quotes *in* the string, which is the one thing the
  style exists to avoid: `a: b #not a key` goes in as those characters.
- **Emptying one is still refused**, and that is a decision rather than an
  omission: `key: >-` with nothing under it and `key:` with no value are two
  different files, and nothing has needed the answer yet.
- The Tier 2 round trip no longer skips block scalars, which is where the
  byte-for-byte undo of one is proved. 6 new tests, 974 in total.

### 2026-08-16 — Phase 6: what it does not model, it does not touch

ADR-011's second half, owed since Phase 2: the constructs this editor carries
rather than reads are now *tested* against a writer, over yxl's own examples.

- **24 carried constructs across seven specs** — `charts`, `pivots`,
  `validations`, `sparklines`, `shapes`, `slicers`, `comments`, `controls`,
  `links`, `filter`, `protect`, `freeze`, `print`, `images`, `background`,
  `gridlines`, `tab_color`, `conditional`, `calc`, `properties`, `active`,
  `visibility` — each sliced out of the file before an edit and compared byte
  for byte with what came back after one. In order, too: a construct that
  survived but moved would be a diff nobody asked for.
- **A key that stops being read cannot fall through.** The suite computes what
  the file writes, subtracts what `MODELED_KEYS` says the loader reads, and
  demands the rest be *marked* — so the day a key leaves the model, the test
  says so rather than the construct quietly vanishing.
- **And it cannot pass by skipping**: both halves have to meet in one file for
  the comparison to mean anything, so the count of files where they do is
  asserted too.

### 2026-08-16 — Two things a reader saw that the tests could not

Both found by looking at the preview over yxl's own examples, and both about
saying *where* something comes from.

- **A `formulas:` range reached nothing.** Put the cursor on one and the note
  said *the range `C2:C3` reaches no cell the grid holds* — of every construct,
  the one whose reach a reader most wants to see. `reaches` counted the cells a
  sheet *holds*, and a range is held as a range (ADR-019). It now names the
  cells the range covers, down to where the sheet writes something: `D2:D1048576`
  is two words in a spec, and a count a reader can act on is not the height of a
  sheet.
- **The inspector spelled a CSV as this machine spells it** —
  `/Users/…/examples/workbook/data/sales-2026-07.csv` — where the spec says
  `data/sales-2026-07.csv`. The absolute path is the same file on every machine
  on the team, spelled differently on each. Named relative to the spec now, as
  the refusals already did.

### 2026-08-16 — Phase 6: honest before you type, not after

- **A cell that cannot be typed into says so.** A grey corner in the grid, the
  reason on hover, and the whole sentence in the inspector when it is selected —
  *this cell cannot be typed into: its value comes from a file beside the spec.
  Type into it anyway to be offered an override.*
- **Two marks, two meanings, kept apart**: red in the top-right corner is an
  exception somebody made on purpose; grey in the bottom-left is one the spec
  makes. A reader can tell which without reading anything.
- **The badge and the refusal come from one rule.** `editabilityOf` decides
  both, so the grid cannot promise an edit the write path will refuse — which
  is the failure a second, kinder rule for the badge would have produced.
- A formula cell is *not* marked: it can be edited, with a formula. What it
  refuses is a plain number typed over a cached result, and that is a sentence
  when it happens rather than a lock in the grid. 6 new tests, 929 in total.

### 2026-08-16 — Sweep after the override work (AGENTS.md §8)

- **The wire's own shape was declared twice** — `Typed` in `protocol.ts` and
  again in the extension — which is precisely the confusion that cost an hour:
  a *message* was handed back where a *value* belonged, and its `kind` rode
  along. One declaration now, in the package that owns the wire.
- **The view's wiring had no tests, and that is where the bug lived.** It reads
  the page and VS Code's bridge out of the global scope, so nothing could hold
  it. It takes both as arguments now and returns the function that answers the
  host — and the test that pins *an override goes out as an override, whatever
  the offer arrived carrying* fails against the old code.
- **A note with nothing to say said it anyway**: a cursor touching no node
  produced *reaches no cell the grid holds*, a sentence with no subject, because
  the host says "nothing" by sending an empty name. Nothing is said now.
- Doc comments that the last split had left *after* their `export` are back in
  front of it, and the README says what the escape hatch is rather than
  promising it. 7 new tests, 923 in total.

### 2026-08-15 — Phase 6: the exception, said out loud

- **A refusal now carries the way out.** *`C3` is filled by the range anchored
  at `C2`* is followed by a box to say why and **Write it as an override**,
  which writes `at: Sales!C3`, the value or the formula, and the `reason` if one
  was given. This is the answer to every refusal `direct` editing gives, and the
  reason the refusals could be firm.
- **The reason is asked for in the panel, not in a box of the editor's.** The
  first attempt used VS Code's own input box, and pressing the button appeared
  to do nothing: the question opened somewhere the reader was not looking, in a
  path no test in this repo can reach. Asked where the sentence is, it is both
  visible and testable.
- **And then it still did nothing, for a better reason.** The offer handed back
  to the view was the *message* that had asked for the edit — and a message
  carries its own `kind`. Spread into the next one, `{ kind: 'override',
  ...typed }` put `'edit'` back on top of `'override'`, so the override was sent
  as an ordinary edit and came back refused by the very rule it was the
  exception to. The offer is built from what was typed now, not passed through.
  What found it was making every outcome say something: the same refusal coming
  back twice is a sentence, where silence was not.
- Every silent return in the write path is gone with it — a spec still loading,
  a sheet name that will not parse, and a successful override, which lands at
  the end of a file nobody is looking at and now says so. An edit that vanishes
  without a word cannot be told from one that was never sent.
- **It is offered, never taken.** An override that the editor reaches for by
  itself is not an escape hatch, it is the door (ADR-007) — so it appears only
  after an ordinary edit was refused, only where there is a cell it could name,
  and only when the reader clicks it.
- **The cell wears a corner mark afterwards**, and says *written as an override*
  on hover: an exception somebody made on purpose is worth seeing without asking.
- **The algebra grew the two ops it needed.** `overrides:` is a sequence of
  mappings, and a value has a renderer while a construct does not — so
  `insertSource` and `addSource` write *lines*, indented to the file's own step,
  read off the file rather than assumed. Their inverse is `remove`, which is what
  makes them safe to have (ADR-026).
- A second override for a cell that has one is refused, naming which entry to
  change: two answers to one question, where the compiler takes the last.
  35 new tests, 907 in total.

### 2026-08-15 — Sweep of Phase 6 so far (AGENTS.md §8)

- **One spelling, three names.** `Sheet!A1` was built by `evaluate.computedAt`
  and by `verify.changedAt` and read by `units.parseQualifiedAddr` — a
  convention with a parser in one package and two writers in others. It lives in
  `units` now, beside the parser that is its other half.
- **Three walkers down a path.** `cst` had `locate` (the node *and* what holds
  it), and `patch` and `intent` had a copy each of the short version. `cst`
  exports `nodeAt` now and the copies are gone.
- **The write path is out of the VS Code adapter.** It was inside `preview.ts`,
  which is the one file no test can reach — so the riskiest code in the tree was
  also the only code with no test. It takes a port of three functions now — read
  a file, put a file, refuse with a reason — and has tests over a fake one:
  values read the way the spec would read them, a formula from a leading `=`,
  the edit landing in the `$include`d file, and every refusal leaving every file
  alone.
- **`draw.ts` had grown to 530 lines and two jobs**: drawing a spreadsheet and
  writing prose. The prose — parameters, tabs, the inspector, the problems, the
  notes — is `panels.ts`.
- **The README said the preview does not edit**, which stopped being true with
  the change above it. It now says what is edited and what is refused, which is
  the honest pair.
- Kept, with the reason recorded: `patch`'s history is still unused, because a
  write to an open document goes on VS Code's own undo stack. It earns its place
  when an edit has to be taken back against a file that has moved since — which
  is what ADR-010 was written for. 8 new tests, 892 in total.

### 2026-08-15 — Phase 6: the first byte the grid writes

Double-click a cell, type, press Enter, and the YAML changes. That sentence is
the whole phase; what is behind it is three refusals deep.

- **A gesture is an `intent`, or a refusal with a reason.** Only a value one
  node of the spec wrote can be typed over: a literal at the cell, or one field
  of an inline `data:` block. Everything else is named rather than blocked —
  *reads a definition, which other cells read too*, *reads row 3 of
  `data/sales-2026-07.csv`*, *is filled by the range anchored at `B4`*, *is
  written as a formula — change the formula*. The reason is the product working
  (ADR-001), not the product apologising.
- **The edit lands in the file that wrote the cell.** `workbook.yxl.yaml` is
  twenty lines of `$include` and the cells are in `sheets/*.yaml`, so an editor
  that could only write the file it was opened as could not edit that workbook
  at all. The checker compiles the **root** either way, with the edited file
  overlaid — a cell of `summary.yaml` means nothing on its own.
- **Everything goes through `checked`**, so an edit that would add an error to
  the spec, or move a cell it did not name, does not happen. A surprise is
  reported and refused for now; the dialog that offers a choice is Phase 7.
- The write goes in as a VS Code workspace edit, which puts it on the editor's
  own undo stack — the AST-level history from the last change is for the edits
  that will not be a text edit to an open document.
- **The grid is no longer rebuilt when the selection moves.** Clicking a cell
  used to redraw every `<td>` in the window, which — besides being ten thousand
  elements of work for a highlight — meant the element a click landed on was
  gone before a second click could reach it, so *no cell could ever be
  double-clicked*. What the view holds of its own now updates in place, and the
  grid is rebuilt only when the spec changes.
- **The way into a cell is a spreadsheet's** — Google Sheets', not Excel's,
  which is a real difference: Enter *opens* the cell rather than moving down.
  Typing a character opens it holding that character, because typing over a
  cell replaces it; a double-click opens it too. Enter commits and moves down,
  so a column can be typed straight through, and Escape leaves it alone.
- **A refusal is said in the preview, under the grid**, not in a notification in
  the corner: a notification is where a reader looks when something *finished*,
  and a refused edit is something they are in the middle of.
- **A cached result is not a value to type over.** `value:` beside `formula:` is
  what Excel last computed (`docs/spec.md` §3); writing a number there would
  leave the formula in place and the workbook showing something else until Excel
  recomputed — the "quietly turn a formula into a constant" failure, wearing a
  disguise. Refused, with what to type instead.
- **The box is inside the cell, so the cell heard everything typed into it.**
  Every keystroke bubbled up to the handler that opens a box, which opened
  another over the last and refused the character on the way past — the reader
  got stacked boxes, a swallowed keystroke, and a white rectangle left over the
  grid when the cell that positioned it was redrawn. Keys typed in the box stay
  in the box now, a cell holds one box, and leaving takes every box with it.
- Verified against yxl's own examples before wiring: editing `Summary!A17`
  rewrites `sheets/summary.yaml` and keeps its style; `Masters!B2` refuses and
  names the CSV; `Summary!B15` refuses and says to change the formula. 27 new
  tests, 879 in total.

### 2026-08-15 — Phase 6: the gate every write passes

- **`verify`**: compile the spec, apply the patch to the *text*, compile again,
  and diff the two grids (ADR-009). What moved is compared against what the
  patch said it would move; anything else is a surprise, and what a surprise
  means is the patch's own business — a cell edit that ripples is worth asking
  about, a refactor that claims to change nothing is refused for one changed
  cell.
- **The wiring is structural.** `checked` verifies *and* applies, and it is the
  only export in the tree that writes a spec — so there is no fast path to
  forget to take, which is what ADR-009 asks for and what a convention would
  eventually fail to deliver.
- **A diff is about the grid, not the file.** Adding a comment, changing a
  quote, moving a line: no change. A value, a formula, a number format, a
  resolved look: a change, named by which of those moved, at an address a
  reader can find. A cell that arrives holding nothing is not a change — a
  reader cannot tell it from the empty address it replaced.
- **An error the spec already had is not this edit's fault.** Someone is
  mid-keystroke elsewhere in the file; refusing every edit until the rest of it
  is valid would fail exactly when the editor is most wanted. What is refused is
  an error the edit *added*.
- 21 new tests, 852 in total.

### 2026-08-15 — Phase 6: edits that can be taken back

The first phase where the file changes starts with the part that makes changing
it safe.

- **`patch`**: a patch is ops, an inverse is worked out against the file as it
  stands, and **a patch whose inverse cannot be expressed is not applied**
  (ADR-026). The history holds no copy of the file — an undo is ops re-addressed
  against whatever the text is *now*, which is what lets a hand edit and a grid
  edit interleave without one of them silently winning (ADR-010).
- **Two ops were missing from the algebra and one was wrong.** `add` (an entry
  into a mapping, above a named key so a removal lands back where it was) and
  `clear` (a key with its value taken off) close the pairs; `write` puts the
  *bytes* of a scalar back where `set` writes a value and lets the renderer
  choose.
- **The corpus found two defects the moment undo was asked for.** `set` over a
  `|` block scalar was writing a plain value across the indented body and taking
  the following lines with it — refused now, and an item of its own. And the
  CST's `source` was holding the parser's *reading* of a scalar rather than its
  bytes, so undoing an edit to `"a\tb"` wrote back `"a\\tb"`: the same string,
  a different file. Both were there before this change and neither could show
  until something tried to put a file back exactly as it was.
- The round trip is asserted over the whole Tier 2 corpus — every yxl example
  and every awkward-YAML fixture — as *byte for byte*, which is the promise
  ADR-010 makes and the one that would rot quietly. 59 new tests, 826 in total.

### 2026-08-15 — Sweep of Phase 5 (AGENTS.md §8)

- **A field nothing read.** `Evaluation.stopped` — a workbook too large to
  compute — was computed and dropped on the floor, so a reader of a huge spec
  got a grid of formulas and no reason. It is on the wire now, with the reason
  the view says: *nothing is computed here; computing some of it would make
  every total over the rest wrong*. The wire carries **why**, as a union, rather
  than a list that has to be empty to mean something.
- **A composite key taken apart by the code that made it.** `evaluate` keyed its
  answers `Sheet!A1` and then sliced the string back into two on every pass to
  rebuild what the engine holds. It keeps the answers per sheet now and makes the
  key once, at the edge where a consumer asks.
- **Sheet identity was a bare `string` from `CompiledSheet` outward**, which §7
  lists under things to avoid, and it showed: `computedAt` had widened its own
  signature to `SheetName | string` and `evaluate` cast its way past it. Branded
  at the compiler, once, where the doc says why a name with a parameter
  substituted into it is not re-checked — `yxl build` is the validator of record
  (ADR-011).
- **`project.ts` had grown two subjects**: the pipeline (parse, load, compile,
  evaluate) and the drawing (a compiled grid, one window of one sheet, as the
  view is handed it). 364 lines became 87 and 308.
- **The README said "Does not evaluate"**, and `DrawnCell`'s own doc said Excel
  shifts a filled range's references *and this does not* — which stopped being
  true the day the engine's offset arrived. Both now say what the code does.
- Not actioned, with the reason: the drawing's tests still live in
  `project.test.ts`, because they reach it through the pipeline — which is the
  seam that matters — and splitting them would duplicate the harness without
  changing a single assertion. 2 new tests, 767 in total.

### 2026-08-15 — What a computed preview gets wrong, and the rule that fixes it

Running the new evaluation over yxl's own `workbook.yxl.yaml` showed **blank
cells and a total of `0`** where the workbook has revenue figures. The cause is
the whole lesson:

- Its formulas name **tables** (`StoreMaster[store_name]`) and a **defined name**
  (`target_revenue`). Neither is a construct this editor models, so neither was
  given to the engine, so the engine answered `#NAME?` — and the spec's own
  `IFERROR(…, "")` around it turned that into an empty string. `SUM` over ten
  empty strings is `0`. Every step was working as designed and the answer was a
  **wrong number wearing the look of a right one**, which is the one thing this
  preview must never show.
- **The rule now: a formula that names anything the engine was not given is not
  computed at all**, and neither is anything that could read it. The lexer
  classifies a bare name as a function, so a name with no executor behind it is
  exactly that set — a table, a defined name, or a function Excel has and this
  engine does not. Those cells show their formula, as they did before Phase 5.
- **Doubt spreads by sheet**, because there is no dependency graph here: one
  uncomputable formula makes the sheet's totals suspect, and a sheet that reads
  it is suspect too. Coarse on purpose — "some of these numbers are computed and
  some are not" is worse to hand a reader than a sheet of formulas and a
  sentence saying why.
- That sentence is under the grid, naming what could not be resolved. It is the
  phase's *unsupported-function reporting* item, arrived at from the other
  direction: what began as a nicety turned out to be what keeps the numbers
  honest.
- `quickstart.yxl.yaml` computes in full, filled range and all. `workbook.yxl.yaml`
  shows formulas and says why. 14 new tests, 765 in total.

### 2026-08-15 — Phase 5: the preview computes

- **Formulas are evaluated, display only.** `SUM(B2:B3)` shows `4150000` where
  it used to show its own text, `1/0` shows `#DIV/0!`, and `TEXT(0.085,"0.0%")`
  shows `8.5%` — 511 functions, from Univer's Apache-2.0 engine (ADR-013).
- **A filled range computes per cell, correctly.** The one thing this preview has
  refused to guess at since Phase 4 — what `B2*0.05` means one row down — is
  exactly what the engine's own shared-formula offset answers, so `C3` now shows
  `B3*0.05`'s value while the spec still holds one formula. The offset comes from
  the cell's provenance, which has recorded it since Phase 3.
- **Nothing computed is written anywhere near the spec (ADR-014).** The computed
  value rides in a field of its own beside the spec's `value`, so what a reader
  is looking at and what an edit could ever be about are different fields on the
  wire. A cell that could not be computed shows its formula, never a number.
- **The engine is driven under its own API and answers synchronously** (ADR-025),
  which is what lets the whole projection stay a function over text. Its
  process-wide range cache is keyed by position and not by contents; the adapter
  works around that with fresh ids per load, which is the sort of thing you only
  find by measuring — a second pass was reading the first pass's blanks.
- The seam holds the parts that are about *the spec* rather than about
  arithmetic: which cells to ask about, a range asked cell by cell, and passes
  until the answers settle. A workbook past the limit computes **nothing**
  rather than the part that fit: half a total is a wrong total. 31 new tests,
  751 in total.

### 2026-08-15 — Rich text is drawn

- **A `rich:` cell is no longer an empty cell.** The runs loaded and compiled all
  along; the drawing had nowhere to put them, so `styling.yxl.yaml`'s A8 showed
  nothing where the workbook holds *Figures are `unaudited` as of Q3.* A run now
  compiles to its text and the flat leaves of its own font — the same vocabulary
  a style layer speaks — and the view draws a `<span>` per run through the same
  code that dresses a cell.
- A run's font is the run's own, not a layer over the cell's: Excel keeps it on
  the string, and nothing else in the workbook can reach it. That is why the runs
  arrive resolved rather than as another `StyleLayer`, which would have implied a
  resolution that does not happen.
- A rich cell holds no `value`, and the inspector already said the right thing
  about it — `written at \`A8\`` — because a cell holding runs was already
  counted as a cell that holds something.

### 2026-08-15 — What the preview looked like, once it was looked at

Three things the screenshots of a running preview showed, none of which a test
in this repo could have.

- **The sheet is now a workbook, not a panel (ADR-024).** It was inheriting the
  editor's theme, so in a dark one an unfilled cell read dark where the workbook
  is white, and a spec that names black — the most ordinary colour there is —
  drew black on near-black. The preview's job is to say what Excel will show, so
  the grid is white paper with black ink and Excel's gridline grey in every
  theme, at 11pt in Calibri, and the chrome around it stays themed.
- **The inspector answered one facet twice.** Two styles reaching a cell that
  both `extends: base` made `base` supply `font.size` twice, and the panel listed
  both — two claims about one fact, with nothing saying which the reader is
  looking at. The layer a cell *wears* is the last one to give a leaf, and that
  is the one named now; a facet the cell's own provenance answered keeps its
  answer.
- **The cursor did nothing in an `$include`d file**, which in a modular workbook
  is every file worth putting a cursor in — `workbook.yxl.yaml` is twenty lines
  of includes, and all the cells are in `sheets/*.yaml`. The preview follows a
  cursor in any file the spec was read from now. Those are read from disk rather
  than from the editor holding them, so an unsaved one says nothing until it is
  saved, the same rule the spec's own file gets from its version.

### 2026-08-15 — Two defects the preview showed when it was looked at

Screenshots of the extension running over yxl's own `examples/` found two, both
in the view and neither caught by a test that draws into jsdom, because jsdom
has no layout and does not scroll.

- **The preview froze on `workbook.yxl.yaml`.** The view asks for a window when
  the reader nears the edge of the drawn one, centred on where they are; the
  host clamps that ask to the last window that fits. At the end of a sheet — and
  everywhere in a sheet smaller than one window, where every row is within a
  margin of an edge — the clamped answer never matched the ask, so the view
  asked again for what it had just been given: a redraw per scroll event, for
  ever. The view now clamps the ask the way the host does, which turns "there is
  nothing more to draw" into an answer rather than a question repeated; the host
  also ignores a window that has not moved, so one stray ask cannot start it
  again.
- **`table-layout: fixed` was never in effect**, because a table laid out fixed
  is only laid out fixed if it has a width of its own. Left to size itself it
  reverted to the automatic algorithm, where one cell holding a 200-character
  formula stretched its column and dragged the sheet sideways out of the panel —
  which is what the third screenshot was. The grid now takes the width it
  computes for itself, and a declared width is the width laid out, `box-sizing`
  included, so the geometry the view scrolls by and the geometry the browser
  draws are the same numbers.

The lesson worth keeping: **every test here draws into a DOM with no layout.**
jsdom answers `getBoundingClientRect` with zeros and scrolls nowhere, so a
defect in *layout* or in *scrolling* cannot fail a test in this repo. Both of
these were found by looking at the thing. The tests added pin the arithmetic
either side of the layout — which window is asked for, what width the table
declares — and that is as close as this suite can get.

### 2026-08-15 — Sweep of Phase 4 (AGENTS.md §8)

A pass over the whole tree at the phase boundary. What it found that was not
tidiness:

- **A `0` that meant "unsaid" drew a column nothing could be seen in.** The
  drawing sent `size: band.size ?? 0` for every band, and the view read that `0`
  as a width — so a column band that set only a style collapsed its column, and
  its cells with it. `Sized.size` is now `number | null`, `null` meaning the band
  said nothing about size, and the type's doc says so. Two tests pin it, one at
  each end of the wire. No test had covered a band that styles without sizing.
- **`Sized.hidden` had been crossing the wire since the first drawing and
  nothing read it**, so a hidden row or column was drawn as though visible.
  Honoured now, by one rule at the geometry: nothing wide is nothing drawn —
  which is also what a `width: 0` in the spec means.
- **The A1 column name existed four times** — private in `units`, again in the
  view, twice in the scale tests. It belongs to `units`, which owns addresses,
  and is exported from there now.
- **`drawCell` was handed the whole sheet to find its own merge**, once per cell.
  The merges are walked once for the covered set already; the anchors come out of
  the same walk, and the cell drawing now takes what it draws and nothing else.
  It moved to `cell.ts` with its own tests — `draw.ts` had grown two subjects and
  514 lines.
- **33 comments carried roadmap coordinates** (`§4.3`, `§8 Q2`, `§9 R5`,
  `Phase 4`), which §8.6 bans because they go stale independently of the code
  they annotate. Each now names the thing instead. ADR references stayed.
- **The README called this a custom editor**, which ADR-020 decided against, and
  said the first release was half-done. It now leads with what the preview does
  today, in a table, and says plainly that nothing writes yet.
- Four exported types with no importer are module-private again; the cell-key
  convention has a name rather than eight copies of a template literal.

Nothing moved between layers, and the five placeholder packages stayed: they are
the layer stack `layers.json` enforces, and deleting them would delete the
architecture to re-add it in Phase 5. 6 new tests, 720 in total.

### 2026-08-15 — Phase 4: keeping your place, without a map for it

- **ADR-015's session identity map is decided: there isn't one, and §8 Q3 is
  answered with it (ADR-023).** The map was to survive positional `NodeId`s
  across a re-read. With the Phase 4 UI built and in view, the premise did not
  hold: the UI never held an id. It keeps a sheet by name, a cell by address, a
  parameter by name — natural keys the *reader* chose, each meaning the same
  thing in the next read.
- **Two keys were positional, and are now names.** The showing tab and the
  per-sheet scroll window were kept by index, so a sheet inserted above them
  moved the reader to a different sheet without saying so. `sheetAgain` looks the
  tab up again — position first, so two sheets briefly sharing a name stay
  distinguishable, then the name, then the first sheet.
- **The wire names sheets too**, which settles a race as well as a rename: an
  `inspect` answered after a re-read is about the sheet that was asked about, or
  about no sheet at all.
- **The cursor is not answered from a stale read.** A span is an offset into the
  text it was read from; asking one about a cursor in text edited since names
  whichever node the shift landed in. The host now compares the document's
  version with the read behind its node map and says nothing until they agree —
  and the redraw that follows says it. A number per projection, not a map.
- A test asserts that **no node id appears anywhere in what the view is sent**,
  so the decision is checked rather than remembered. 9 new tests, 714 in total.
  Phase 4 is complete.

### 2026-08-15 — Phase 4: a window that follows the scroll

- **A large sheet is no longer drawn only at its top left.** The view keeps the
  200 × 50 window the measurement bought, and moves it: it pads the rows above
  and below and the columns either side, so the scrollbar says how much sheet
  there is, and asks the host for another window on coming within 20 rows or 5
  columns of an edge of the drawn one. The new window is centred on the reader,
  which is what stops it asking again on the next scrolled row.
- **Scrolling is not a keystroke, and no longer costs one.** `redraw` draws
  another window from the grid the host already compiled — the parse and the
  compile behind it are what an *edit* costs. On a spec where that is 353ms,
  doing it per scroll would have been the whole feature undone.
- The scroll position survives the redraw that answers, because the padding puts
  every row at the same offset whichever window is drawn; switching sheets starts
  at the top, because that scroll position belongs to the other sheet.
- The geometry moved to its own module and is tested as values — where a row
  sits, which row a scroll position has reached, which window to ask for — and
  the view's tests assert the drawn rows and the pad sizes. 20 new tests, 704 in
  total. §9 R5 is closed, and the "says what it left out" note is gone: there is
  nothing left out to say.

### 2026-08-15 — Phase 4: the number, and what it decided
- §9 R5 asked for a measurement before a grid library was chosen. Here it is,
  over a built spec of **100 000 written cells** (738KB of YAML): parse 353ms,
  load 5ms, compile 27ms, flatten every address in the box 52ms, ten thousand
  cell lookups 1ms. 6 new tests, 667 in total.
- **§8 Q5 is answered: no library.** The projection is not the cost; parsing is,
  and the one cost that would not have survived that size is the DOM — a hundred
  thousand `<td>`s. A library would bring a spreadsheet model of its own, which
  fights ADR-001, to solve a problem the numbers say we do not have.
- **The preview draws a page of a sheet** — 200 rows by 50 columns — and says
  what it left out: *4801 more rows and 10 more columns are not drawn*. A cap
  that says so is honest; a corner of a sheet shown silently is a preview that
  lies about how much there is. Following the scroll is the better answer and is
  now its own item.
- The measurement stays as a test with ceilings ten times what was measured, so
  it fails the day linear work turns quadratic rather than the day a machine is
  busy. The large spec is *built*, not stored: a megabyte of generated YAML in
  the repository would be a fixture for a number that changes with the code.

### 2026-08-15 — Phase 4: the view, tested
- The drawing had grown to a grid, merges, styles, an inspector, parameter
  boxes, problems, and highlights, with nothing testing any of it. 19 tests now
  do, under jsdom (MIT, checked at the registry), 661 in total.
- **The DOM is on for one file, not for the suite** — `@vitest-environment` at
  the top of the test rather than a config change, so 642 other tests keep
  running without one. jsdom over happy-dom because these tests assert what CSS
  the drawing produced, and a faithful CSSOM is the whole point of asking.
- Two things the tests pinned that only a DOM could: a merge draws **no `<td>`**
  for the cells it swallows (one would push the row along), and an Excel colour
  reordered for CSS comes out **green rather than transparent magenta** —
  `AARRGGBB` handed to CSS as written is a different colour, silently.
- The view asks for four things and the tests check each is asked with what the
  reader pointed at: select this cell, show that sheet, set this parameter, take
  me to that source.

### 2026-08-15 — Phase 4: a number under its format
- `0.085` with `format: "0.0%"` draws as `8.5%`, `2400000` under `#,##0` as
  `2,400,000`. **ADR-022**: through `numfmt` (MIT, no dependencies, checked at
  the registry), because an Excel format code is a small language and a subset
  of it would draw wrong numbers — the lesson the filled-formula bug already
  taught, paid once.
- **Excel's inheritance rule is honoured, and it is Excel's rather than yxl's**:
  a band's `#,##0` leaves a heading alone, because a code with fewer than four
  sections says nothing about text (`docs/spec.md` §4). A `format:` written on
  the cell itself is a request and is always applied. Deciding that needs the
  style *layers*, so the host decides which pattern applies and the view applies
  it — each on the side that has what the decision needs.
- An unreadable pattern draws `######`, which is Excel's own answer, rather than
  throwing the view away.
- Still not right: a `type: date` or `type: duration` shows the text the spec
  wrote, since this projection never converts either to a serial. Now an item,
  with the note that it is the arithmetic yxl already documents.

### 2026-08-15 — Phase 4: one spec, several workbooks
- A box per declared parameter sits above the grid. Type in it and the spec is
  drawn as though the parameter were that; empty it and the spec's own default
  comes back. **Nothing is written to the file** — it changes what is drawn,
  which is what a preview standing for several workbooks has to mean. 4 new
  tests, 638 in total.
- **A set value is read the way `--set` reads one**, and that turned out to be
  the same reading a bare CSV field gets: `0.15` is a number, `007` is text.
  Upstream shares one function for the two (`infer_scalar`), and so do we now —
  the CSV reader and the parameter switcher call the same six lines.
- A name set that the spec does not declare is reported rather than ignored: a
  typo in a parameter box should say so, which is upstream's rule for `--set`
  and the same one here.
- The view now asks for three things and touches the file with none of them:
  where a cell came from, take me there, and draw it as though this were
  something else.

### 2026-08-15 — Phase 4: the compiler, from the editor
- **yxl: Check the Spec** and **yxl: Build the Workbook** run the compiler over
  the file being edited, with its output in a `yxl` channel and its first line
  in a message. A successful build offers to open the workbook. 10 new tests,
  634 in total.
- **§8 Q6's open half is answered: required, not bundled.** Bundling means a
  binary per platform, its update cadence, and a `.vsix` per target — for users
  who already have yxl, since what this previews is its input. A missing
  compiler is a message with the install link, which is the whole of what
  bundling would have bought, and an optional download later is a smaller change
  than undoing a bundle would be.
- **The pin is compiled in rather than read.** §8 Q6 says the targeted version
  lives in one place; a bundle cannot read that file at runtime, so esbuild
  defines it from the root manifest at build time. One source, no copy to drift.
- The version check follows Q6's rules exactly and refuses nothing: an older
  compiler may not have a construct this editor understands, a newer one has
  possibly moved the schema and still builds what this writes. Both are said
  once a session.
- `yxl build --check` is the validator of record (ADR-011), so this is how a
  reader hears what the preview deliberately does not say — an undefined
  reference, a sheet name Excel will refuse, a construct carried as opaque.

### 2026-08-15 — Phase 4: a diagnostic points at the cell, not just the line
- A diagnostic now marks the cells it is about, in the grid, as well as landing
  in VS Code's Problems panel with a range. 2 new tests, 624 in total.
- **The path from a diagnostic to a cell was already built.** A diagnostic names
  a place in a file; `nodeAt` turns that into the node a reader would call the
  cause; `reaches` turns the node into the cells where the effect shows. Two
  functions written for the jump, reused whole.
- **A diagnostic that reaches no cell stays in the list.** A band whose `at`
  will not read, a sheet with no name: there is no cell to point at, and
  inventing one would be worse than the list. The distinction falls out of
  `reaches` returning nothing rather than being coded for.
- The list under the grid is clickable now too, on the same message channel the
  inspector uses — one way to say "take me there", not two.

### 2026-08-15 — Phase 4: the jump closes
- The other half: put the cursor in a node and the grid highlights every cell it
  reaches, with a line above the grid saying what and how many. A cursor on
  `defs.styles.header` lights up the cells wearing it; on a `cells:` entry, that
  one cell. 2 new tests, 622 in total.
- **The innermost node wins.** A cursor sits inside the document, the sheet, and
  the cell all at once, so the narrowest span holding it is the one being
  pointed at. That rule is the whole of `nodeAt`, and it is why a cursor inside
  a definition does not light up the whole workbook.
- **`reaches` was already there**, built in Phase 3 with no consumer. It cost
  nothing to build then and nothing to use now — the one case where writing a
  thing before its caller paid, because it was a fact about the grid rather than
  a guess about a UI.
- Cross-sheet is deliberately quiet: a definition reaches cells on sheets that
  are not showing, and the view highlights only the sheet you are on rather than
  switching under you. The count says how many were found in all.

### 2026-08-15 — Phase 4: why a cell looks the way it does
- Click a cell and the inspector answers §4.3's promise in the words it was
  written in: *this is bold because `defs.styles.header` says so, `#,##0`
  because column A's band says so, and its value is the definition
  `defs.values.rate`*. 11 new tests, 620 in total.
- **Every line that names a node is a link.** Clicking one opens the file it
  lives in and selects the span — including a definition an `$include` put in
  another file, which is the case a reader most needs help with. That is the
  first half of the bidirectional jump; the second, cursor to cells, is what
  `reaches` was built for.
- **A reference takes you to the definition, not to the reference.** `defRef`
  names both nodes, and "why is it this value" is answered by the definition.
- **The wording lives in the extension**, not in `compile`. The core carries
  identity — a `NodeId` and a span — and turning that into a sentence a person
  reads is the UI's, which is what keeps ADR-004's line where it is.
- The view now asks two things and changes nothing: *where did this come from*
  and *take me there*. A read-only preview has no third question, and the
  protocol says so out loud.

### 2026-08-15 — Phase 4: what a filled cell says
- Trying the preview on yxl's own `quickstart.yxl.yaml` showed the first real
  defect: every cell of a `formulas:` range drew the range's formula verbatim,
  so `C3` said `=B2*0.05` where Excel will hold `=B3*0.05`.
- **The display was the thing that was wrong, not the deferral.** §8 Q2 already
  says relative-reference translation waits for the parser Phase 5 brings, and
  writing a regex for it now would break on `LOG10(x)` and on a quoted `"A1"` —
  the guess this project exists not to make. So a filled cell now says **where
  it reads from** (`↧ C2`, dimmed, with the whole story on hover) instead of
  printing a formula that is false everywhere but the anchor.
- Worth keeping as a lesson about previews: showing something wrong is worse
  than showing less, and the difference only became obvious with a real spec in
  front of a real person. Tier 5 earning its place on day one.

### 2026-08-15 — Phase 4: the preview exists
- Open a `*.yxl.yaml` and press *yxl: Open Preview to the Side*: the spec is
  parsed, loaded, compiled, and drawn as a grid beside the text, redrawn 150ms
  after you stop typing. 10 new tests, 608 in total.
- **ADR-020: a panel, not a custom editor.** A `CustomTextEditor` replaces the
  text editor for a file, which states the opposite of §1's premise — and states
  it at the moment the editor can do least, since nothing is editable yet. Both
  open at once is also the whole point: seeing the workbook *while* editing the
  spec is what makes this release worth shipping.
- **ADR-021: esbuild**, two bundles — CommonJS for the host with `vscode`
  external, an IIFE for the view. It also surfaced that pnpm 11 refuses a
  dependency's install script unless it is named, and esbuild has one; the
  workspace file now names it, which is a better default than the old silent
  yes.
- **§8 Q5 is answered for this release: a plain table.** A read-only preview
  needs no cell editor and no spreadsheet model, so a grid library would only
  answer size and speed — and R5 says to measure those first. The measurement is
  now its own item, ahead of any choice.
- The one seam worth naming: `project(text, file, read)` is the whole pipeline
  as a function over text, with nothing of VS Code in it. The host decides *when*
  to call it and where to put what comes back; that is why ten tests cover the
  drawing without a single mock.
- Three things the preview does not do yet, each now an item rather than a
  surprise: it shows a stored value rather than the number format Excel would
  apply, it lists diagnostics under the grid rather than marking the cell, and
  the view's own drawing is untested until there is a DOM to test it in.

### 2026-08-15 — Refactoring pass at the Phase 3 boundary (`AGENTS.md` §8)
Walked the lenses in order over everything Phase 3 landed.

- **One idiom, nineteen times.** `String(filled…(ctx, x, node).value)` was how
  every reader in `compile` asked for substituted text. It is `text(ctx, x,
  node)` now, and `filledText` folded into it — the typed result is wanted in
  exactly one place, a cell's own value, and that one asks for it directly.
- **Six diagnostics had no test.** `unclosedPlaceholder`, `unknownFormula`, and
  the four bad-address family are reachable *only* through a parameter — the
  loader has already read the literal forms — so nothing exercised them by
  accident. Covered now, 17 of 17, and the tests say why the check exists at
  compile time at all. The `empty` origin was in the same position: one shape
  produces it (a cell that is only a number format) and nothing pinned it.
- **Four test files, one harness.** Each had its own five-line parse-load-
  compile. Shared, in a module the package index deliberately does not export —
  a caller with a `SpecDoc` calls `compile`, and one without has a loader.
- `STYLE_PROPERTIES` was exported with no reader. The type still derives from
  it; the array is an implementation detail until something walks it.
- Documentation: the README described a project that stopped at the model, and
  §5's Tier 3 claim was a sentence weaker than what CI now asserts.
- Typecheck, 598 tests, lint, the layer check, and build clean. Dependencies are
  all at their latest, pnpm included.

### 2026-08-15 — Phase 3 complete: the data a spec keeps beside itself
- `csv:` and `json:` blocks are read through an injected reader, the same shape
  `$include` uses, and their cells carry `external` provenance — the origin
  §4.3 named and nothing had yet produced. 23 new tests, 591 in total.
  **Phase 3 is complete.**
- **The corpus test lost its last exception.** Every upstream spec now compiles
  with *no* diagnostics, so the CSV and JSON readers meet real files on every
  commit rather than only fixtures. The same test reader serves both halves,
  which is a small proof that ADR-004's shape is the right one: the core asks
  for a file the same way whether an `$include` or a `csv:` block named it.
- **The two paths resolve differently, and that is upstream's rule, not ours.**
  An `$include` resolves against the file that wrote it; a `data:` path resolves
  against the spec that was opened (`docs/spec.md` §9, yxl ADR-016). Written on
  both readers, because a reader that guessed would fail quietly.
- CSV reads narrowly on purpose: `007` quoted stays text, `0x1F` and `True` stay
  text. That is Excel's reading of an imported file rather than YAML's core
  schema, and the test says so where a future reader would otherwise wonder.

### 2026-08-15 — Phase 3: what an edit would cost, and whether it may happen
- The two derivations that sit on top of provenance: **editability** (§4.3,
  ADR-006) and **impact** (§4.4's ripple count, §4.6's expected diff). 23 new
  tests, 568 in total.
- **Neither is stored.** A class is a fact about an origin and a ripple is a fact
  about the grid; keeping either as a field would be a second copy to keep true.
  ADR-006's requirement is that the UI hold no *second opinion*, which a function
  in `compile` satisfies exactly.
- Writing the tests corrected a reading of §4.3: **a cell that carries only a
  look is `direct`**, not `empty`. The node exists, so writing a value into it
  is one change to one mapping. `empty` is for an address where no cell was
  written at all — which the projection answers with `null` rather than a cell,
  so its row is asserted on the origin itself.
- `reaches` counts a **band** and the **base of an `extends:` chain**, not only
  a direct `$ref`. Both are ripples a user would be surprised by, which is the
  test that matters for a number shown before an edit.

### 2026-08-15 — Phase 3: a look as the layers that made it
- Style resolution lands as ADR-005 asked for it: an ordered list where each
  layer holds **only the leaves it set**. 17 new tests, 545 in total.
- **A style is flattened to its leaves** — `font.bold`, `border.left.color` —
  named by the path that reaches them in a spec. That is what makes "layer per
  attribute" (`docs/spec.md` §4, §6) a fold rather than a merge algorithm, and
  what will let §4.4 ask "which layer supplies *this* property" without a search.
  `border: all` is spread over the four sides on the way in, so no reader of a
  border has to know the shorthand exists.
- **A layer records how it reaches the cell, not just what holds it.** A column
  band naming `header` gives the definition's layers with `through: 'column'`.
  Without that, §4.4's two candidates — edit the definition, or edit the band —
  are indistinguishable, which is the whole reason the list exists.
- **The look belongs to an address, not to a cell.** A band reaches every cell
  in its span, written or not, so `styleAt(sheet, addr)` answers where a stored
  `CellProvenance.style` could not. §4.3's sketch is corrected to what was built.
- The workbook-default layer is the one piece missing, and only because
  `default_font` is not modeled yet: it is a document key this editor still
  carries as opaque.

### 2026-08-15 — Phase 3: the grid's values, and where each of them came from
- `compile` turns a `SpecDoc` into the grid: `cells:`, inline `data:`,
  `formulas:` ranges, and `overrides:` applied last, with per-facet provenance
  on every one. 40 new tests, 517 in total. Every upstream spec now **compiles**
  with no diagnostic but the one saying a `csv:` file was not read.
- **ADR-019: the projection is sparse.** A `formulas:` range stays a range and
  `cellAt` answers for the cells it covers. `at: D2:D1048576` is two words in a
  spec and would have been a million objects here, rebuilt on every keystroke —
  and the same argument covers bands. The write-up is short because the
  alternative fails on a number, not on a judgement.
- **Provenance is the point, not a decoration.** `literal`, `inline`, `defRef`,
  `param`, `formulaRange`, and `override` all get produced and tested. The one
  that shows why §4.3 insisted on *per facet*: an override that writes a value
  leaves the format where it was, so a cell reads `override` for one and
  `literal` for the other, and a resolver can offer the right change for each.
- **Parameters are substituted here, not in the loader**, which is what lets the
  origin say `param` with the template and the names it used. `docs/spec.md` §7
  is followed to the letter, including the rule that a value which is *exactly*
  one placeholder keeps the parameter's type. A name nothing declares is left
  standing in the text and reported — showing `${region}` beats showing a blank.
- **A `csv:` block is reported, not drawn.** The core may not open files
  (ADR-004) and no reader is injected yet; that is now its own Phase 3 item,
  ahead of Phase 4, because a first release whose grid has a hole where the data
  was is not a first release.
- **A filled range's formula is not shifted per cell.** §8 Q2 already says
  relative-reference translation waits for the parser Phase 5 brings; until then
  the provenance carries the anchor and the offset, which is what a UI needs to
  say "filled from D2" honestly.

### 2026-08-15 — pnpm 11
- The bump the sweep left for its own change: **pnpm 10.27.0 → 11.21.0**, which
  is two lines. The lockfile did not move — still `lockfileVersion: 9.0`, so
  `--frozen-lockfile` keeps working and there is no dependency graph to re-review.
- `engines.node` tightens to **>=22.13**, which is pnpm 11's own floor rather
  than a preference of ours. CI's `node-version: 22` already resolves above it.
- pnpm 11 checks that `node_modules` matches the lockfile before running a
  script, and re-installs by shelling out to `pnpm`. Harmless where pnpm is on
  the path, which is everywhere it is meant to run — worth knowing if a shim
  invokes it some other way.

### 2026-08-15 — Refactoring pass at the Phase 2 boundary (`AGENTS.md` §8)
Walked the lenses in order over everything Phase 2 landed. 60 lines net
removed, and one gap in the tests closed.

- **Every reader began with the same four lines** — open a mapping, check it,
  take its entries — and every sequence with the same five. Both are one thing
  now (`openEntries`, `readEach`), which took 207 lines out and put 147 back.
  `band.ts` lost a bespoke type that had been a private copy of what the shared
  one already said.
- **§5 promised a fixture the fixtures did not have.** Tier 2's description
  named anchors and tabs-in-strings; the awkward set covered neither. Rather
  than trim the promise, the fixture now exists — an anchor nothing aliases and
  a tab inside a quoted scalar, both of which the CST keeps byte for byte. That
  is the honest direction to close a doc/reality gap when the code can already
  do the thing.
- **Deleted three exports with no caller** — `nodeIdAt` and `Brand` from their
  package indexes, and a `keyOf` re-export nobody used — and made
  `openMap` / `entriesOf` / `itemsOf` module-private now that one helper wraps
  them. Same house rule as the Phase 0–1 sweep: re-exporting later costs a line.
- **The tests had two copies of the `$include` reader**, one per test file. It
  is the shell half of ADR-004 and now lives once, in the corpus harness, where
  the extension's version will have an obvious sibling.
- Documentation: §4.2's `units` and `spec` rows described packages that no
  longer exist as written (`dimensions` that were never built, "constructors
  only" for a package whose second half is the key vocabulary), and the README
  still said the model stopped at the shape of a spec.
- Every diagnostic code the loader can raise has a test asserting it — 25 of 25,
  checked rather than assumed. Layer check, typecheck, lint, and 477 tests clean.
- **Left alone, deliberately:** pnpm is 10.27.0 against 11.21.0 available. A
  package-manager major is its own change with its own risk (lockfile format),
  and §8.9 says to land a toolchain bump where it can be reviewed as one.

### 2026-08-15 — Phase 2 complete: the oracle, and what it can honestly claim
- Tier 3 stands up and is green: 29 conformance assertions over the pinned
  compiler, wired into CI. **Phase 2 is complete** — L1 reads every construct
  the grid will need, from one file or from several.
- **ADR-018**, and it came from building rather than from planning. Two findings:
  1. **The JS target has no library surface.** `moon build --target js` emits a
     program — `main.js` runs `main()` and exits, and the `main.d.ts` beside it
     declares nothing. ADR-002 measured that the pipeline *runs* on JS, which is
     true; "the loader runs in-process" needed an exported API that does not
     exist. The compiler ships a released binary per platform, so the oracle is
     that, run as a subprocess. CI downloads it (checksum verified) instead of
     installing a MoonBit toolchain, which is both cheaper and closer to what a
     user actually runs.
  2. **"The two agree" cannot mean "the same verdict"**, because ADR-011 has us
     validate only what projection requires. So conformance is one-directional —
     *anything this editor refuses, the compiler refuses too* — plus a listed
     corpus of the specs it refuses and we deliberately carry. Being the
     stricter of the two is the failure a user feels; the other direction is
     design, and now it is enumerated rather than asserted.
- **What Tier 3 does not catch, stated in §9 R1 rather than glossed:** it
  compares verdicts, not models. A quoted `"007"` read as the number seven would
  pass every test here. The fix — a machine-readable model dump from the
  compiler — is an upstream ask worth making the first time a defect of that
  shape appears, and not before.
- The oracle's version is asserted equal to the pin rather than skipped when
  absent. The schema moves until yxl's v1.0, so an answer from the wrong build
  says nothing about this code, and a missing build says nothing at all.

### 2026-08-15 — Phase 2: `NodeId` derivation, and the map that did not get built
- Derivation was already in: an id is the file plus the path that reaches the
  node, derived on every read and written to nothing (ADR-015). What this change
  adds is **three tests that say what identity currently is** — the same source
  re-derives the same ids, a mapping key survives a sibling appearing before it,
  and a sequence item does not.
- **The session identity map moved to Phase 4**, and that is the substance of
  this entry. A `NodeId` is positional, so inserting a band gives every band
  after it a new id — and hands the old id to the band next door, which is the
  sharper half of the problem. None of that costs anything until something holds
  an id *across* a re-read, and the first thing that will is the Phase 4 UI.
- It is also the same question as §8 Q3, which asks whether losing UI selection
  state on an external re-read is acceptable at all — and which Phase 4 was
  already going to answer. If the answer there is yes, most of what the map is
  for goes with it. Building it now would mean choosing what makes two nodes
  "the same" with no consumer to check the choice against; the alternative
  design (ids from natural keys rather than indices) has the same problem and
  would supersede an accepted ADR on a guess.
- The characterization test is the hedge: it fails the day identity changes, so
  the decision cannot be made silently.

### 2026-08-15 — `overrides:` shipped upstream; the pin moves to v0.3.4
- [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) is **closed as completed**:
  `overrides:` is in yxl v0.3.4, `docs/spec.md` §23. **ADR-007's dependency is
  gone**, §8 Q9 is answered, and §9 R7 is closed — the one risk that looked
  structural was a coordination risk, and writing the request down carefully is
  what retired it.
- What shipped tightened the proposal in four ways, and each is a rule the
  resolver has to respect rather than a detail: `at:` is **sheet-qualified**
  (`Sales!E37`), an override **must have something to override**, there is **one
  override per cell**, and inside a filled range it may land anywhere **but the
  top-left**, where Excel stores the shared formula. That last one answers the
  case §4.4's `formulaRange` row had no good answer for: the exception comes out
  of the range and the range stays whole.
- The pin moves to **0.3.4** (§8 Q6). Nothing this editor already reads changed —
  the cell grammar is the same six keys, now stated once upstream so an override
  can share it — and the whole suite is green against the new checkout.
- Reading `overrides:` is now a Phase 2 item rather than a Phase 6 one. It
  changes what a cell *shows*, so a Phase 4 preview that skipped it would draw a
  value the workbook will not have. Writing them stays in Phase 6.
- It needs a unit this project does not have: a **sheet-qualified address**,
  including the quoted form Excel uses for a name with a space.

### 2026-08-14 — `overrides:` requested upstream
- Filed [yxl#66](https://github.com/t-ujiie-g/yxl/issues/66) for §8 Q9 / ADR-007.
- Writing it up changed the request and **downgraded R7**. yxl can already
  express an override, through the documented last-wins key order (`docs/spec.md`
  §2); what it cannot express is that a cell *is* one. So the ask is for intent —
  something countable, explainable, and foldable — rather than for capability,
  and Phase 6 is no longer hard-blocked on the answer. §8 Q9, §9 R7, and ADR-007
  updated to say so, including the fallback to design against in the meantime.
