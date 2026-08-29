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

### What "good enough to work in" means

Reading a spec in a grid is worth shipping, and it is not the goal. The goal is
that on an ordinary day — somebody opens a workbook, pastes a column out of a
report, fixes three numbers, bolds a heading, and sends it on — **this is where
that happens**, and the file that changed is still the YAML.

That sets a bar the projection stance does not set by itself. Every gesture a
person already has in their hands — select a range, `Cmd`+arrow to the edge of a
block, copy, paste from Excel, delete, insert a row, drag a column wider — has to
**work**, or say in one sentence why it cannot yet. A gesture that silently does
nothing is the worst answer available; a gesture that asks a question about
something with only one answer is the second worst.

It softens nothing above it. The grid is still a projection, an edit with one
meaning still applies and one with several still asks, and the spec still gets
no worse. What grows is the *vocabulary* those rules have to cover — from one
cell at a time to what a person actually does — and §6 is ordered by how often
an ordinary day needs the gesture, not by how interesting it is to build.

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

### What it is, in one sentence (2026-08-23)

**A VS Code extension in which everything `docs/spec.md` can say is reached the
way a spreadsheet user would reach for it.** Two things that were in this
document are no longer its business: a shell other than VS Code, and an
assistant that proposes edits. Both were architecturally cheap and neither is
what the project is for; they are taken out rather than left to stand in the
phase list as things that will be got to (§6, 2026-08-23). The measure of done
is **schema coverage** — which of the spec's sections a reader can see, and
which they can change, from the grid — and the phases from 12 on are ordered by
how often an ordinary day needs the gesture, the same rule §6 has always used.

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
   API nor the DOM. That is what makes them testable on values alone, and what
   keeps `extension` a thin edge. (ADR-004, after yxl ADR-003)
9. **Type-safe boundaries.** No bare `string` for A1 addresses, sheet names,
   colours, or node ids in internal APIs. Branded types, parsed once at the edge.
   (yxl design principle 6)
10. **Parity with yxl is measured, not promised.** We reimplement part of yxl's
    loader in TypeScript; the only honest way to hold that is to test both
    against each other on every commit. (ADR-012)
11. **The gestures are the ones already in the reader's hands.** Keys, selection
    and the clipboard behave as Excel and Sheets behave; where those two differ,
    Sheets decides how it *behaves* and Excel decides how it *looks*. A gesture
    this editor cannot carry out is refused in a sentence — never ignored, and
    never quietly approximated.
12. **Asking costs a click, so ask only where there is something to choose.** An
    edit with one meaning applies; the question is for the edits with several.
    And a question about five hundred cells is *one* question. (ADR-001)

## 4. Architecture

### 4.1 The layer stack

```
┌──────────────────────────────────────────────┐
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
| `units` | — | Branded types and the readers that make them: `A1Addr`, `A1Range`, `ColumnSpan` / `RowSpan`, `QualifiedAddr`, `Color`, `SheetName`, the three definition namespaces, `ParamName`, `FilePath`, `NodeId`. Parse at the edge, pass typed inside. Also `moved`, which shifts the references in a formula (ADR-031). |
| `cst` | L0 | `eemeli/yaml` behind our own seam: source → span-carrying tree; apply an op list as a minimal byte patch. The *only* package that knows YAML syntax exists. (ADR-003) |
| `spec` | L1 | The `SpecDoc` AST — the TypeScript shape of `docs/spec.md` — and the schema's own vocabulary: `MODELED_KEYS`, which is where the line ADR-011 draws is written down. Types and tables, no logic. |
| `loader` | L1 | CST tree → `SpecDoc`, with the validation projection requires and `$include` expanded through an injected reader. Preserves unmodeled-but-valid constructs verbatim, marked `opaque`. (ADR-011) |
| `compile` | L2/L3 | `SpecDoc` → `CompiledGrid` + per-facet provenance and style layers. Pure and deterministic; the workhorse. Reaches a `csv:` / `json:` file only through an injected reader. (ADR-005, ADR-019) |
| `normalize` | L4 | The style normalizer: an applied style becomes a reference to a declaration, a variant extending the nearest one, or the look itself — in that order of preference. (ADR-008, ADR-037) |
| `patch` | L0/L1 | `Patch` → `cst` ops, the inverse patch that makes undo AST-level (ADR-010), and how many lines a patch rewrites. |
| `verify` | L4 | The double-compile diff gate every patch passes. (ADR-009) |
| `evaluate` | — | Formula evaluation behind a seam; display only, never written back. (ADR-013) |
| `intent` | L4 | `EditIntent` → `Resolution[]` → `Patch`. Holds the resolution table (§4.4) and the impact estimator. Sits highest of the core packages, because resolving needs all of them. |
| `webview` | UI | The grid, the inspector, the resolution dialog. The only package that renders. |
| `extension` | edge | VS Code custom editor registration, filesystem, `yxl` CLI invocation, settings. The only package that imports `vscode`. |

Nothing below `webview` and `extension` may know it is in VS Code, or in a
webview; that is what keeps the core testable on values (ADR-004).

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
| `empty`, with a cell | rewrite that cell *(auto)* — the spec wrote it for its look and it has one place a value goes |
| `empty`, with none | ① new `cells:` entry ② extend the adjacent `data:` rectangle, when there is one |

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

**`setSize`** — a width or a height is a band, never forty cells:

| What sizes it now | Candidates |
|---|---|
| nothing | a `columns:` / `rows:` band of its own *(auto)* |
| a band over that one alone | change its `width` / `height` *(auto)* |
| a band over several | ① change the band *(with how many it spans)* ② split it so this one stands alone, every other key it had kept |

A band already over exactly what was dragged **is** the band of its own, and
takes the size whether or not it said anything about size before (ADR-042,
superseding the note that stood here: two entries with one `at` are one band
said twice, and layering is for spans that *differ*). Where several bands size
the run and each reaches past it, one band over the run layers over them all,
which is the only answer that leaves the columns outside it alone.

`setSize` and `setStyle` are asked over a **span** — the columns or rows a
heading selection names — as well as over one column or one rectangle. The rows
above are the same rows: what changes is that the count is taken over the span,
and that "a band of its own" is one band over the span rather than one per
column (ADR-041, ADR-042).

**`setFreeze`** is not a table here and is deliberately not one: a sheet's panes
have exactly one place to live, so there is nothing to enumerate and the gesture
is an `Intent` rather than a list of answers (ADR-040). The same is true of any
sheet-level key that the schema keeps once.

**`insertRow` / `insertCol`** — enumerate consequences *before* running:
`cells:` A1 keys shift (this is what bloats a diff), `data:` rectangles gain a
blank row or move, `formulas:` ranges extend or move, `merges:`/`tables:`/charts
follow. Show the expected YAML diff size, and when `cells:` is what is bloating
it, offer the `data:` conversion instead (this is the yxl Phase 11
diff-stability work, surfaced at the moment it matters).

### 4.5 Patch

```ts
type Patch = { ops: Op[] };
```

Ops address the YAML tree by path, and come in pairs because every one of them
has an inverse (ADR-010, ADR-026, ADR-027):

| | |
|---|---|
| writes a value | `set` ↔ `write` / `clear` |
| writes a key | `renameKey` ↔ itself |
| adds an entry | `insert`, `add`, `insertSource`, `addSource` ↔ `remove` |
| takes one out | `remove` ↔ `restore` |

`set` and `add` write a *value* and let the renderer choose how; `write`,
`restore`, `insertSource` and `addSource` write *text*, which is what makes an
undo byte-exact. Still to come, with the phase that needs them: ops that address
a companion CSV or JSON file. A bulk-rekey op is *not* coming — every op is
located against the tree as it was, so a row insertion's four hundred
`renameKey`s are four hundred disjoint edits (2026-08-23).

What a patch is *allowed* to change is not part of the patch: it is an `Expects`
passed beside it to §4.6's checker, so the same ops can be applied under a
stricter or looser claim.

Undo is expressed at this level and **run at whichever level still describes
the file** (ADR-030): an edit is applied as a VS Code `WorkspaceEdit`, so a hand
edit and a grid edit share the editor's stack, and `patch`'s `History` takes the
last edit back in place while the file is byte-for-byte what this editor left it
at. The history keeps the record and applies nothing — a step's patch goes
through §4.6's checker like every other write.

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

The third row is what makes a refactor safe to accept at all: a proposal that
provably changes nothing visible is safe regardless of how it was produced.
(ADR-009)

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
  — we are never the stricter of the two; a corpus of our own that the compiler
  builds and this editor must read whole, for the corners upstream's examples
  leave untried; and a listed corpus of specs the compiler refuses and we
  deliberately carry, so the gap ADR-011 opens is measured rather than claimed. This is the direct answer to "we now maintain a
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

**The number follows the order**, so that §10 — take the first phase with an
unchecked box — can be read off the page. **Phases 17–20 are the release
programme**, opened on 2026-08-29 from a reader's own list after working in the
preview (§11). *There is no Phase 16*: the deterministic refactors held that
number while running last, which every reader had to work around, so they are
**Phase 21** now. The gap is left rather than closed, because five entries in
§11 and the pull requests they name say Phase 17 and are already history.

### The everyday gestures, and where they land

The list a reader would use to answer *can I work in this?*, which is also the
list §6's order comes from. ✅ is in; a phase number is a promise about order,
not a date.

| | |
|---|---|
| Type a value or a formula; `Enter`, `F2`, or just start typing | ✅ |
| `Enter` commits and moves down; `Esc` abandons | ✅ — `Shift`+`Enter` up, `Tab` right, `Shift`+`Tab` left, as both spreadsheets move |
| A line break inside a cell | ✅ — `Alt`/`Cmd`/`Ctrl`+`Enter`, and the cell is drawn with the break |
| Arrows, `Tab`, `PageUp` / `PageDown` | ✅ |
| `Delete` empties a cell | ✅ |
| Undo and redo | ✅ — from the grid without leaving it, and VS Code's own where the file has moved since (ADR-030) |
| The answers a refused edit has, with what each would change | ✅ — the range, the definition, the parameter, the CSV, the blank cell, and a rectangle whose cells came from several of those, answered a group at a time |
| Select a range — drag, `Shift`+click, `Shift`+arrows, `Cmd`+`A` | ✅ |
| `Cmd`+arrow to the edge of a block, `Home` / `End` | ✅ |
| Delete, copy or cut a range | ✅ |
| Copy, cut and paste inside the grid | ✅ — values and formulas, whose references move; looks are Phase 9 (ADR-032) |
| Copy out into Excel or Sheets | ✅ — the whole look into Sheets; Excel takes everything but the fill (ADR-033) |
| Paste from Excel or Sheets | ✅ for the values; the looks wait on Phase 9's normalizer (ADR-034) |
| A box to type an address into | ✅ — in the corner today, and moving to the formula bar in **Phase 10**, since the corner is where a spreadsheet keeps *select all* |
| Find something in the sheet | ✅ — `Cmd`+`F`, `Cmd`+`G` through what it found |
| Bold, italic, underline, strike | ✅ — from the toolbar, through the normalizer, with the ripple count where the look is shared |
| Fill, text colour, borders, alignment, number format | ✅ — from the same toolbar, colour and borders in the menus a reader of Sheets expects |
| Drag a column wider, a row taller | ✅ — written as a band, and a band over more than the one dragged is a question |
| Freeze the heading rows | ✅ — honoured wherever the reader has scrolled to, and set from the toolbar at the cell they are on |
| Click a heading to take the whole row or column | ✅ — drag or `Shift` across several; the headings light as they do in both spreadsheets |
| The corner takes the whole sheet | ✅ — and takes it as whole columns, so a look over it is a band |
| A look over the columns selected, in one gesture | ✅ — one band through the normalizer, never four hundred cells (ADR-041) |
| A width over the columns selected | ✅ — drag one edge of the run and all of them take it |
| Double-click the heading edge to fit the column to its contents | ✅ — measured in the font each cell wears, not counted in characters |
| Hide and unhide a row or a column | ✅ — from the heading's own menu, with a mark on the heading a hidden run sits behind |
| Group rows or columns, and collapse the group | ✅ — the outline is drawn on the headings, and the control writes the collapse |
| A formula bar over the grid | ✅ — what the cell holds, editable there, never what it computes to |
| What the selection comes to — count, sum, average | ✅ — under the grid, over the values as computed |
| `Cmd`+`B` / `I` / `U` | ✅ — the key presses the switch the toolbar draws |
| The font face and size | ✅ — a list of faces a spec may name, not the fonts this machine happens to have |
| Currency, percent, more and fewer decimals; clear formatting | ✅ — the decimals are arithmetic on the format code, so the rest of it survives |
| A right-click menu on a heading | ✅ — hide and show again live there |
| A right-click menu on a cell | ✅ — cut, copy, paste, clear; it is where Phase 11's insert and delete will hang |
| Insert or delete a row or column | ✅ — from the heading, over the run selected, with what it moves in front of it |
| Merge cells | ✅ — from the cell's own menu, and lossless: the covered values stay in the spec |
| Fill down, and the drag handle | ✅ — `Cmd`+`D` / `Cmd`+`R`, offered as a range or as cells; no drag handle |
| Sort a block of rows | ✅ — over a `data:` block, each row written where it goes exactly as it was |
| Add, rename, delete, reorder a sheet; a tab colour; hide a sheet | ✅ — all from the tab bar and the tab's own menu; `split:` is drawn read-only |
| See that a sheet has an auto filter, and put one on | ✅ — every header cell wears the mark, and the cell's menu puts one on or takes it off; the preview does not filter *by* it, since the schema carries no per-column criteria |
| A note on a cell | ✅ — the red corner, the note on hover, and *Insert note* / *Edit note* / *Delete note* in the cell's own menu |
| A link on a cell, and following it | ✅ — drawn as a link, `Cmd`+click follows it, and the menu writes one to a page or to a cell; the two are never told apart by how the target reads |
| A dropdown list of allowed values | ✅ — a `list:` offers its choices in the cell, the other kinds say what they ask on hover, and *Data validation…* writes a list over the selection |
| Conditional formatting, applied in the drawing | ✅ — every kind of rule, over the evaluated values, display only (ADR-014) |
| Format a region as a table | ✅ — the banded region drawn with its header, and *Format as table* over the selection, which refuses a region Excel would repair rather than open |
| See a chart, an image, a sparkline that the spec declares | **Phase 14** |
| Insert a chart over a selection, place an image | **Phase 14** |
| Edit rich text, run by run | ✅ — the run picked in the formula bar, its font left as it stands; the whole cell is not typed into, since a cell cannot be `rich` and hold a value too |
| Edit a cell whose value comes from a CSV, a parameter, a definition | ✅ Phase 7 |
| Start a spec from nothing | **Phase 18** — a template this editor writes; `yxl` has no `init` and does not need one |
| Build the workbook and open it | ✅ from the command palette; **Phase 18** puts it where it can be clicked |
| Read the editor in Japanese | **Phase 19** |
| Replace what a find turned up | **Phase 18** — proposed; every replacement is an ordinary cell write |
| A second selection with `Cmd`+click | **not planned** — every write here is about one rectangle, and §4.4's answers are counted over one |
| Zoom, a format painter, freeze by dragging the pane edge | **not planned yet** — none of them is in the schema, and none is load-bearing |

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
      the structural phase's), and structural edits inside flow collections
      (which Phase 7 taught it, for the flow form a cell is written in).
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
- [x] Put back an entry that holds more than a scalar. `remove` of
      `A1: { value: 1, style: header }` has no inverse in this algebra, so it is
      refused (ADR-026); a structural edit needs one that can carry a subtree.
      **Shipped** as `restore`, which puts back the lines a removal took rather
      than a value (**ADR-027**) — so a subtree comes back, and so does the
      quoting `add` used to re-render away. The removal takes the comment block
      that introduces the entry with it, since the two belong together. Proved
      over the corpus: every entry of every spec, removed one at a time, comes
      back byte for byte or is not removed at all.
- [x] Tier 4 end-to-end green
      **Green**, and it is the first tier where the compiler runs for real: a
      real spec is copied out, edited through the same `write` the UI calls,
      built with the pinned `yxl`, and read back with `yxl extract` — the
      compiler's own reader, so this tier needs no `.xlsx` library of its own.
      Three edits are followed all the way: a value, a formula (which arrives as
      a formula, not as the number it stood for), and an override over a filled
      range, where the range around it still holds its own formula.

### Phase 7 — `mediated` write-back
Where it starts to feel like a spreadsheet.
- [x] The §4.4 resolution table, row by row
      **`formulaRange` ① and ②** are in: a formula typed anywhere in a
      `formulas:` range is offered as *the range's* own — shifted back to the
      anchor, which is where the one formula is written (ADR-031) — and as a
      split of the range around that cell, every piece re-anchored, which moves
      that one cell and nothing else. Neither the split nor an override is
      offered *at* the anchor, where the shared formula is kept
      (`docs/spec.md` §23).
      **`empty` ①** is in: typing into an address nothing reaches offers it as a
      new `cells:` entry, written where the sheet keeps its cells — and the
      `cells:` key itself where the sheet has none. ② (extend the `data:`
      rectangle next to it) **is now a Phase 11 item**: it decides whether a
      spec grows a hundred `cells:` entries or a table, which is the same
      judgement Phase 11's `data:` conversion offer has to make, and a row left
      half-ticked here would keep §10 pointing at a phase with nothing in it to
      do.
      **`external` ①** is in for CSV, which is the row that reaches out of the
      spec altogether: what it carries is the companion file as it should be,
      checked by compiling the spec with that file overlaid and diffing, exactly
      as a patch is (**the checker grew a second door, not a second lock**).
      **`param` ①** is in: a cell that is exactly one placeholder offers the
      parameter's default, with every cell that follows it. Not offered where
      the cell is a *sentence* (`"${quarter} ${region}"` typed over would have
      to be split back across two parameters), and not while the preview is
      showing that parameter as something else — changing the default then
      would leave the grid exactly as it was.
      **`defRef` ① and ②** are in, which is the row this phase is *about*:
      change the definition every cell reading it follows, or write this one
      cell as a value of its own. Both are offered, always — one moves forty
      cells and the other moves one, and nothing but the reader knows which was
      meant. The count beside each is `reaches`, the same answer the inspector
      highlights with.
- [x] Resolution dialog: candidates, each with a pre-computed impact summary and
      a sample of affected cells
      **Shipped**, as answers under the grid rather than a modal over it: each
      one says what it does and what it would move — `4 cells (B2, B3, B4, …)` —
      and the reader picks. Nothing is picked for them (ADR-001), and the
      candidates are worked out again when one is chosen, because the file may
      have been edited by hand since it was offered.
- [x] `normalize`: the style normalizer, ahead of every style write (ADR-008)
      **Shipped as a decision, which is all a normalizer is**: given the look a
      construct is to contribute and what the spec already declares, it answers
      with the name of a declaration that says it, an inline variant of the
      nearest one, or the look itself (**ADR-037**, which supersedes ADR-008's
      third step on the evidence of what `yxl extract` writes). The writing is
      Phase 9's, and it has one rule to obey: nothing reaches a spec's styles
      except through this answer.
- [x] Range edits with mixed origins
      **Shipped for the paste**, which is the rectangle gesture that has answers
      to give: a rectangle landing on cells of several origins is refused with
      the origins counted, and then offered one answer *per origin* — write the
      ones a range fills as overrides, or the ones reading a definition as
      values of their own, and paste the rest either way (§8 Q14). An answer
      carries the group it resolves rather than the whole rectangle, which is
      the machinery that half of Q14 was waiting on. `Delete` keeps its one
      answer: a cell a range fills has nothing that would empty it, and an
      override that says a cell is blank is not something `docs/spec.md` §23
      offers.
- [x] `external` origins: edit the companion CSV/JSON, or divert to `overrides:`
      **CSV is in**: a cell whose value is a field of a CSV beside the spec
      offers to write *that field*, and nothing else in the file moves. JSON is
      not: putting a value back into a JSON document without reformatting the
      rest needs the span-keeping treatment the CST gives YAML, and reformatting
      somebody's data file to change one number is not a trade this project
      makes. The override is offered beside it, as always.
- [x] Surprise-diff confirmation UI for the `ok: 'ask'` verdict
      **Shipped**, and it needed no new message: an edit that moves more than it
      named is offered *Apply it anyway*, with the count and the first of the
      cells it would move — the same list the answers are shown in, because
      that is what it is. Saying yes runs the same gesture again with the
      surprises accepted, so what lands is worked out from the file as it stands
      rather than from a copy held while the question was open.

### Phase 8 — The grid as a spreadsheet
Selection, the keys, and the clipboard: the gestures a reader has in their hands
before they have an opinion about this editor. Nothing here is new *authority* —
every one of them lands as an edit the resolver and the checker already gate —
and all of them are what makes the difference between a viewer and a place to
work.
- [x] A selection that is a **range**: drag, `Shift`+click, `Shift`+arrows,
      `Cmd`+`A`
      **In**: the view holds an anchor beside the cell it has selected, and
      every gesture that reaches moves one and leaves the other. Nothing else
      changed — the inspector still asks about the cell the reader is *on*,
      which is what a spreadsheet answers about too. **The headings as
      selectors was written on this line and never built**; it is Phase 10's
      first item now (2026-08-21), because everything else about a heading
      hangs off it.
- [x] `Cmd`/`Ctrl`+arrow to the edge of a block, `Home` / `End`, and a box that
      takes an address and goes there
      **The keys are in**, over the cells the host has drawn: along a run to its
      far end, or across a gap to the next thing there is, which is what
      `Cmd`+arrow means to anyone who has held it down. The address box is not,
      and is the first thing in the next slice with `find`.
- [x] **Delete over a range** — one intent for the rectangle, and the same rule
      about what a cell may hold (`docs/spec.md` §3) applied to each of them
- [x] `Cmd`/`Ctrl`+`Z` and `Cmd`+`Shift`+`Z` **from the grid**, which run the
      editor's own undo over the file — the stack a `WorkspaceEdit` lands on
- [x] **Empty the ones that can be**, offered where a rectangle holds cells that
      cannot: one summary and one answer, which is the same machinery the
      oversized paste below needs
- [x] `Cmd`+`Z` **without the focus round trip** — today the host shows the text,
      runs the editor's undo and gives the keyboard back, which flickers. The
      alternative is `patch`'s own `History` applied as a `WorkspaceEdit`, which
      needs the guard that makes two stacks safe: the file must be exactly as
      this editor left it, or the editor's own undo is the only honest one
      (ADR-010)
      **In**, with the guard as written and one thing it forced (ADR-030): once
      this editor's own history has taken the file back, the shell's stack
      holds those undos as edits, so reaching for it would put the edit on
      again. The grid says there is nothing left to take back instead, and the
      text editor's own `Cmd`+`Z` is where the rest of the file's history is.
- [x] **One parse per rectangle**, not per cell — `clearCell` reads the file
      through `located` for every address, so a large selection parses it as
      many times
      **Done** by giving `intent` a `Reading` where it took a `Text`: the same
      text, plus the tree parsed from it once per file. Built once per gesture
      in `write.ts`, so a rectangle, a candidate list and an override each parse
      what they read once. 800 cells over an 11.7 KB spec went from 6.6s to
      124ms.
- [x] Copy, cut and paste **inside** the grid, as intents rather than as a
      buffer of cells
      **In.** What `Cmd`+`C` holds is a *place* — a sheet and a rectangle — not
      the cells in it, so the paste is worked out from the file as it stands
      when it lands (ADR-032). A formula takes its references with it
      (ADR-031); what the cell it lands on *wears* stays; a cell that cannot
      take it offers the same "the ones that can" answer `Delete` does. The
      system clipboard is the next two items.
- [x] **Room to work in**, past what the spec writes — a sheet that reaches
      exactly as far as its last cell is a table of what is there, not a place
      to work, and there is nowhere to paste into or type a new row. The grid
      now draws empty rows and columns beyond the data, which is what every
      spreadsheet does and what makes the `empty` row of §4.4 reachable at all.
      Growing it further as the reader scrolls is not in: the room is a fixed
      amount past the last cell.
- [x] **Copy out**: TSV *and* HTML on the clipboard, so Excel and Sheets receive
      the values and the look they were shown (**ADR-028**)
      **In**, and the split is ADR-028's own: the text carries the *value*
      (`1234.5`), the table carries how it *looked* (`1,234.50`, bold, filled).
      Written inside the gesture that asked for it, because that is the only
      way a page can put two flavours on the clipboard without a permission.
      A rectangle reaching past the drawn window is said rather than half
      copied, and a merge is copied as its values rather than as a merge.
      **Sheets takes all of it. Excel takes everything but the fill**, and that
      is where it is left (ADR-033, §8 Q15): this editor's job is the workbook
      the compiler builds, and that carries every style there is.
- [x] **Paste in** from Excel or Sheets: values from the TSV, look from the
      HTML, landing as *one* resolution — a `data:` rectangle where the shape
      says so, `cells:` where it does not (§4.4, §8 Q1, Q11)
      **The values are in and the look is not** (ADR-034): a style write goes
      through the normalizer, and the normalizer is Phase 9. The shape is
      asked once with the lines each answer would add, which closes §8 Q11 —
      one `data:` block, or `cells:` entries, and only the second where the
      spec already writes those cells. A field means what it would mean typed
      into the cell, so `1,234` is text and `1234` is a number.
- [x] A paste too big to ask about cell by cell: one summary, one answer, and
      the size of the diff it would make said before it is made
      **In**, and the size is *measured* rather than estimated: each shape is
      worked out, applied against the file in memory, and the lines it would
      rewrite counted (`patch.rewrites`). Five hundred cells that cannot be
      written now group by what stood in the way — 2 filled by a range, 1
      reading a definition — rather than naming the first and counting the rest,
      which is §8 Q14's *origins grouped, a count against each*. The other half
      of Q14, answers that apply per group, is still open.
- [x] Find in the sheet, and go to what it found
      **In**, with the address box the last slice left behind. The search runs
      on the **host**, over the compiled sheet, because the view can only see
      the window it was drawn — a reader looking for something in row 800 finds
      it. What is searched is what a cell *holds*, value and formula, and a
      `formulas:` range answers at the anchor it is written at, which is the one
      place a reader can act on it.

### Phase 9 — Look you can apply
The other half of what a person does with a sheet, and the half that decides
whether the spec survives contact with a GUI (ADR-008).
- [x] A toolbar of what a reader reaches for: bold, italic, fill, text colour,
      borders, alignment, number format
      **Shipped**: bold, italic, underline, strike, a fill, a text colour, both
      alignment axes, wrap, a number format, and a border on any edge — above
      the grid, each showing what the selected cell wears and each taking itself
      off again (**ADR-038**, **ADR-039**). Two holes are named rather than
      hidden: a format code the list does not offer is shown but cannot be
      typed, and a border round the *outside* of a range asks each cell for a
      different edge, which is a want per address rather than one for the
      rectangle.
- [x] Every style write through the **normalizer** and through §4.4's `setStyle`
      table — change the definition, or fork it for this range, with the ripple
      count shown *before* the choice
      **Shipped**: `setStyle` finds the layer the look comes from and offers
      what §4.4's table says — change the declaration every cell reading it
      follows, change the band over the whole column, or write it on these cells
      — each with the count of what it would move. Where nothing else says how
      the cell looks there is one answer and it applies without asking. What
      lands on the cells is the normalizer's answer (ADR-037), so bolding a cell
      that wears `base` writes `{ extends: base, font: { bold: true } }` rather
      than a fourth anonymous look.
- [x] The same over a range whose cells have different origins: "apply to all"
      and "split by origin", never a silent pick
      **Shipped**: a rectangle whose cells take the look from different places
      is grouped by the layer each property comes from, and offered both — write
      it on every cell alike, or change each origin where it lives — with the
      count each would move, and neither ever taken without asking. Where an
      override hides what a cell would carry, only the split is offered, and
      where the two would leave the file the same they are one answer and it
      applies.
- [x] Column width and row height by dragging, written as `columns:` / `rows:`
      bands rather than as forty cells
      **Shipped**: the edge of a column or row heading is a grip; the size
      follows the pointer and is written once, on the way up, in the units the
      spec keeps it in. §4.4's `setSize` table decides where it lands, and a
      band over more than the one dragged is a question — change the band, or
      split it so this one stands alone.
- [x] `freeze:` (`docs/spec.md` §2) honoured in the preview, and set from it
      **Shipped**: the rows above the freeze and the columns left of it stay
      put while the rest scrolls, and they stay put wherever the reader has
      scrolled to — the frozen band is drawn beside the window rather than
      inside it, so a reader in row 800 still reads the headings (**ADR-040**).
      The toolbar freezes at the cell selected and takes the freeze off again;
      a sheet written with a `split:` is refused rather than rewritten, since
      the schema cannot hold both and the split is not ours to drop.

### Phase 10 — The headings, the bar, and the keys
Everything a reader reaches for that is **not a cell**. None of it is new
authority — every write still lands through §4.4 and §4.6 — and all of it is
what a reader of Excel or Sheets tries within the first minute and finds
missing. It comes before structural edits because insert and delete are
gestures on a *heading*, and the headings are not selectors yet.

- [x] **The row and column headings select.** Click one to take the whole row or
      column, drag or `Shift`+click across several, and `Cmd`+click nothing —
      one rectangle at a time, as everywhere else here. Promised in Phase 8's
      first item and not delivered there; carried here 2026-08-21 rather than
      left ticked.
      **In.** A heading takes its whole run out to the sheet's own extent, the
      pointer dragged across the headings reaches, and the headings the
      selection touches are lit as both spreadsheets light them. The grip keeps
      its own gesture: pressing the edge sizes, pressing the heading selects.
      What the view sends with the *look* that follows is how the selection was
      taken (**ADR-041**), because a look over a whole column is a band.
- [x] **The corner takes the sheet**, which is the button every spreadsheet
      keeps there — so **the address box moves into a formula bar** and stops
      squatting where *select all* belongs.
      **In**, with the bar it needed. What the corner takes is *whole columns*
      (ADR-041), so a look over the sheet is a band over its columns rather
      than a `cells:` entry per address the grid happens to be drawing — which
      is what `Cmd`+`A` and then bold would have written before today.
- [x] **A look over what is selected, in one gesture.** §4.4's `setStyle`
      answered over a *span* of columns rather than a rectangle of cells.
      **In**: a look asked for over whole columns or rows is **one band**, put
      through the normalizer like every other style write (ADR-008), claiming
      the cells it moves and no more. The per-cell answers are not offered
      there at all — over four hundred rows they are not what anybody meant
      (ADR-041) — and where something already supplies the look, that answer is
      offered beside the band as it always was.
- [x] **A size over what is selected**, which is the other half: dragging one
      edge of several selected columns sizes all of them. `setSize` takes one
      column today, and the answers over a span are the same rows of §4.4's
      table with the count taken over the span.
      **In** (**ADR-042**), and it took one of §4.4's own notes with it: a band
      already over exactly what was dragged takes the size, rather than a
      second band being written beside it.
- [x] **Double-click the heading edge and the column fits what is in it.** The
      width is *measured* — the view knows the font each cell wears; the host
      knows every cell there is (§8 Q17) — and lands through `setSize` like a
      drag, so the answer is a band and a shared band is still a question.
      **In** (**ADR-043**): the host sends the run drawn as cells, the view
      measures it against the font each wears, and what comes back is an
      ordinary drag. One column at a time, which is what the gesture names — a
      run of them fits each to a different width, and that is N writes rather
      than one.
- [x] **Hide and unhide** (`docs/spec.md` §4 `hidden:`). The preview honours it
      already and cannot set it; a hidden run also needs the marker between the
      headings that says something is there.
      **In**, through §4.4's band rows once more — the band already over the run
      takes the key, nothing over it gets one of its own, and a band that hides
      more than was named is the same question a wider band always asks. Showing
      again takes the key out, and the band with it where that was all it said.
      The run that is hidden is marked on the heading it sits behind, and the
      mark is the way back. **The headings have a right-click menu now**, which
      is where the hide lives; a cell's is what the last item of this phase has
      left.
- [x] **Grouping**, which is the same band and nearly the same gesture
      (`docs/spec.md` §4 `group:`, outline level 0–7).
      **In**, all three parts. **Drawn** in a gutter of its own, as both
      spreadsheets keep it: a row above the headings per column level, a column
      left of the row numbers per row level, with the bracket over the run and
      the control at its end (**ADR-045**, superseding ADR-044 — the origin
      every other measurement is taken from moves with the gutter, and is a
      function of the sheet now rather than a constant). **Collapsed and opened** from that control, which is the
      `hidden:` write the last slice built: `group` plus `hidden: true` is what
      the schema calls a collapsed group, and the `+` that opens one sits on the
      heading the run is behind, where the plain hidden mark would otherwise be.
      **Set** from the heading's own menu, through §4.4's band rows once more.
      The corner's level buttons (`1` `2` `3`, collapse everything at a level)
      are a bulk write over every band at once and are **not** in this slice.
- [x] **A formula bar.** What the cell *holds* — the formula, not what it comes
      to (ADR-014) — legible without opening the cell, and editable there
      through the same intent path typing into the cell takes. The address box
      sits beside it, as in both spreadsheets.
      **In**: address, `fx`, and what the cell holds, above the grid. `Enter`
      sends the same edit typing into the cell sends, so every refusal and
      every answer is the one the cell would have given; `Esc` puts back what
      was there. The bar is *rebuilt* on every restate rather than written
      into, because what it sends is about the cell selected now — unless the
      reader is typing in it, whose text is theirs until they leave.
- [x] **What the selection comes to**, under the grid: count, sum, average of
      the rectangle, from the evaluated values and unreachable from any write
      (ADR-014).
      **In**, and computed on the **host** for the reason `find` and the fit are:
      the view is drawn a window and a whole-column selection reaches past it
      (ADR-019), so a sum taken there would be the sum of what happened to be
      drawn. It is asked for only where the selection is more than one cell,
      which is when a spreadsheet shows one.
- [x] **The keys a look has**: `Cmd`/`Ctrl`+`B`, `I`, `U` — the toolbar has
      them and the keyboard does not.
      **In**, answered at the page rather than at the cell, and by *pressing the
      switch the toolbar draws*: the toolbar is rebuilt on every restate, so it
      already knows the rectangle and what that rectangle wears, and the key
      cannot drift from the button. The shortcut is written on the button as
      both spreadsheets write it. A box of text keeps its own keys — which the
      `Cmd`+`A` guard had missed since the cell editor became a `textarea`.
      A heading click **keeps the keyboard on the grid**: the browser was
      putting it on the page, since nothing there could hold it, and every key
      the page answers was lost with it. VS Code answers the forwarded key too,
      so the extension binds all three to a command that does nothing while the
      preview is the active panel (**ADR-046**).
- [x] **The rest of the bar a reader expects**: the font face and size
      (`docs/spec.md` §6 has both, the toolbar offers neither), the quick number
      formats Sheets keeps beside the menu — currency, percent, more and fewer
      decimals — and *clear formatting*, which is `setStyle` asked to take
      everything off at once.
      **In**. The face is a **list, not the machine's fonts**: a spec is read on
      machines other than this one, so what it may name is what Excel will look
      for, and whatever the cells already wear is kept and shown alongside.
      **Currency is in the box rather than a button of its own** — the symbol is
      a choice, and a button would have to make it for the reader.
      **More and fewer decimals** are arithmetic on the format code
      (`units/format.ts`), which is why they keep the rest of it: `¥#,##0` gains
      a place as `¥#,##0.00`, and every section of a two-part code moves
      together, as Excel does it.
- [x] **Clearing a look off a cell that names a declaration** writes each of the
      declaration's properties as `null` rather than dropping the `style:` key.
      The cell wears nothing either way (ADR-038) and the name does go, but the
      file says it the long way round. The same is true of taking one property
      off, so this is about how a cell's own look is written, not about
      clearing.
      **Fixed** where it was decided: what a cell must say is now measured with
      **no declaration kept**, because `normalize` is what decides whether one
      is named at all. Where that leaves nothing to say there is no key, and
      where it leaves something the declaration is still offered as a base — so
      taking one property off a cell that wears more still writes
      `{ extends: header, font: { bold: null } }`.
- [x] **A right-click menu on a cell.** The headings have one (it came with
      hide and unhide, which had nowhere else to live); a cell's is what is
      left — cut, copy, paste and clear to begin with, and it is where Phase
      11's insert and delete will hang.
      **In**, with the key beside each entry as both spreadsheets write it, and
      the selection kept where the right button lands inside it. **Paste is the
      browser's to give**: it hands the clipboard to the keyboard and to
      nothing else, so the entry acts only on what was copied inside the
      preview and says why where it cannot. Both menus moved out of `draw.ts`
      into `pointing.ts`, which is now where a menu at the pointer is built.

Deliberately **not** here: a second selection with `Cmd`+click (every answer in
§4.4 is counted over one rectangle), zoom, and a format painter.

### Phase 10.5 — What the last pass left
- [x] **A look on a cell a `formulas:` range fills.** A `cells:` entry may not
      overlap a range (`docs/spec.md` §3), so the cell has nowhere to carry one.
      The two places that can are a `columns:`/`rows:` band over the region —
      what §3 recommends, and what the reader may not mean when they picked one
      cell — and an `overrides:` entry, which §23 says is *the* answer inside a
      filled range and which ADR-007 already designates here. Offer both and
      ask (ADR-001); today the gesture is refused with `nothing here can carry
      that look`, which is true and unhelpful.
      **In**, both, as a question. The band is over the axis the **range** runs,
      since that is the one that reaches every cell it fills. The exception is
      not offered at the range's top-left, where the shared formula is stored
      and where §23 refuses one — there the run is the only answer.
- [x] **A look over a rectangle that spans a data block and cells.** Each cell
      is answered on its own today, which is right, but the answers are not
      counted together — a reader who selects ten cells should hear one sentence
      rather than one per cell.
      **Written from a guess, and the guess was wrong**: the answers *are* one
      candidate and one sentence already. What was actually broken is underneath
      it — where none of the cells has a `cells:` entry yet, each of them asked
      for the `cells:` mapping to be made, and the checker refused the patch with
      `` `cells` is written twice ``. A sheet has one such key however many
      entries go under it, so the ops that would each make it are folded into
      the first.

### Phase 11 — Structural edits
- [x] `insertRow` / `insertCol` / `deleteRow` / `deleteCol`, with the
      consequence enumeration and the expected-diff-size preview (§4.4). The
      row *header* is where a reader reaches for this, so the headings becoming
      selectors (Phase 10) is the gesture it hangs off
      - [x] **The references** every one of them moves: `shifted` in `units`,
            beside `moved` and sharing its parser. A structural edit moves what
            stands at the line or past it **whatever the `$` says** — the cell
            it names has moved — which is the opposite of what a shared formula
            does, and the reason the two rules are separate over one walk. It
            moves a reference into that sheet **from another sheet too**, and no
            reference out of it. A reference into what a delete takes away is
            **refused, never written as `#REF!`**: a spec is read by people, and
            a file that says `#REF!` is a file nobody can fix from.
      - [x] **The consequence enumeration** over a sheet: what each construct
            does, counted, before anything is written. One entry per line of
            YAML the edit would touch, which is the size §4.4 says to show —
            and where the entries are mostly `cells:` keys, that count *is* the
            case for offering the conversion instead. Beside them, what stands
            in the way: a formula naming a row a delete would take, and rows
            that come from a CSV, which this cannot open a gap in.
      - [x] **The write itself**, construct by construct: a `cells:` key is
            renamed and a formula rewritten wherever it stands, a `data:` block
            opens a gap or moves by its anchor, a range and a merge take the
            line in or move whole, a band's `at:` follows, the freeze moves with
            the cell it names. `rekeyMap` turned out **not to be needed**: ops
            are located against the tree as it was and spliced at the end, so
            four hundred `renameKey`s are four hundred disjoint edits, and the
            op the §4.5 table was holding a place for is one the language does
            not have to grow.
      - [x] **The gesture on the heading**: *Insert N rows above / below* and
            *Delete N rows* on the row numbers, the same three on the column
            letters, over the run the reader has selected. The count is in
            front of them where it is more than a handful — the edit is
            **offered rather than taken**, with what it moves and how much of
            that is `cells:` keys, which is §4.4's diff-size preview. The
            `data:` conversion it should offer beside that is the item three
            below; until it exists the count says what the keys cost and no
            more.
- [x] **A field cannot go into rows written as `[a, b]`.** Inserting a column
      through an inline `data:` block needs the CST to rewrite a flow sequence,
      which it does not do yet; the gesture refuses and says so. Rows written a
      line at a time take one either way.
      **In**: a field goes into a flow row at a **point**, not by rewriting the
      row, so several go in at once and every other edit to that line stays
      disjoint. Taking one out narrowed the same way. What is still refused is
      taking *two* fields out of one row at once: each would claim the comma
      between them, and no rule makes both disjoint — so the gesture says to
      take them away one at a time.
- [x] ~~`rekeyMap` for bulk A1 shifts in `cells:`~~ **Not needed** (2026-08-23).
      Ops are located against the tree *as it was* and spliced at the end, so
      four hundred `renameKey`s are four hundred disjoint edits — there is no
      collision to sequence and no bulk op to write. The place §4.5 was holding
      is given back.
- [x] `merge` / `unmerge`, and band creation
      **Merging is lossless here**, which is the difference worth knowing: Excel
      throws away every value but the top-left, and a spec keeps them — the
      merge only *draws* over them (`docs/spec.md` §2), so taking it apart again
      gives the sheet back exactly. Refused where it would cross a merge already
      there: yxl passes overlapping merges through, and Excel is what would
      complain about the workbook.
      **Band creation** was already done, and by the gestures that need one: a
      look or a size over a whole column writes a band of its own where none is
      over exactly that span (ADR-041, ADR-042).
- [x] The "convert this rectangle to `data:`" offer, at the moment a `cells:`
      block proves it needs it — and with it **§4.4's `empty` ②**, the answer
      that extends the `data:` rectangle next to an address rather than writing
      a `cells:` entry beside it. Carried here from Phase 7 (2026-08-19): it is
      the same judgement about when a spec wants a table, asked from the other
      end, and answering it twice in two phases would answer it twice
      **The conversion is in**, as a gesture of its own on the rectangle
      selected, and the line question points at it where the count it is showing
      is `cells:` keys. Each field is taken **as the file wrote it**, not as the
      value it compiled to, so a quoted `"007"` is still text afterwards. A cell
      that says more than a value is refused by name: a table has nowhere to
      keep a look.
- [x] **§4.4's `empty` ②** — typing into the cell *beside* a `data:` block
      offering to extend the block, rather than writing a `cells:` entry over
      it. The judgement is the same as the conversion's and the machinery is
      now there; what is left is the row in the resolution table.
      **In**, for the row *under* a block whose columns reach the address: the
      answer puts a row into `values:`, with nothing in the fields before it.
      Only for a block written **here** — a block that reads a file has its rows
      in the file — and only for a value, since `values:` has nowhere to keep a
      formula. The question was already being asked (the `newCell` answer has
      not been `alone` beside a block since Phase 7); it now has the second
      answer it was asking about.
- [x] Fill down and fill right, and the drag handle — which is reference
      translation, and waits on §8 Q2
      **In**, on `Cmd`+`D` and `Cmd`+`R` and in the cell's own menu, as a
      question with two answers: **one `formulas:` range** — which is what
      Excel's own fill makes of a formula, and what a spec says in one line —
      or **a cell each**, the references moved per row (ADR-031). The range is
      not offered where the line holds values, or where anything is already
      written under it, since a range may not cross a cell the sheet writes.
      **The drag handle is not in**: the keys and the menu are the gesture, and
      a handle is a second way to ask the same question.
- [x] Sorting a `data:` rectangle: its rows rewritten, and nothing else touched
      **In**, from the cell's own menu, over the rows selected and by the column
      the selection starts in — the row moves whole, the column only says which
      key. Each row is written where it goes **as the file wrote it**, so a sort
      changes the order of the lines and nothing about any of them. Numbers,
      then text, then nothing, as a column orders in Excel.

### Phase 12 — The sheets themselves
A workbook is more than one sheet, and a spreadsheet user reaches for the tab bar
before the toolbar. **Complete.** The tab bar adds, renames, deletes, reorders,
hides and colours a sheet and switches its gridlines, and every key that says
what a sheet is — `visibility`, `tab_color`, `gridlines`, `split` — is modelled
rather than carried through blind (`docs/spec.md` §2).
- [x] **A new sheet**, from a `+` on the tab bar: one `- name:` entry at the end
      of `sheets:`, and the tab bar shown even for one sheet so there is
      somewhere to press
      **In.** Added at once under the next free name — `Sheet2`, `Sheet3`, …
      past the ones there are — as both spreadsheets do; renaming is the tab's
      own gesture, the next item. (A webview has no `prompt`, which the first
      cut leaned on and which is why its `+` did nothing.) The name is checked
      at the writing edge against Excel's own rules
      (`docs/spec.md` §2) — which yxl refuses a spec over, so a name it would
      refuse is refused here first, by the rule it breaks. `verify` learned to
      take a **sheet** as something an edit may claim, beside the cells it may
      claim, which is what every other item in this phase will need.
- [x] **Rename a sheet** by double-clicking its tab, or from the tab's own
      right-click menu — the tab becomes the box the new name is typed in, since
      a webview has no dialog to ask in. The two clicks are counted in the view,
      not left to `dblclick`: going to a sheet redraws the bar, so the second
      click lands on an element the first never saw. One
      edit rewrites the sheet's `name:`, every inline cell formula, every
      `formulas:` range body, every `defs.formulas` body, and every override's
      `at:`. `renamed` is the third rule over the one formula parser in `units`
      (beside `moved` and `shifted`): it rewrites only the word before a `!`,
      quotes the new name where Excel's grammar needs it, and leaves a name
      inside a string alone. The edit claims exactly the cells whose formula it
      rewrites, so `verify` still catches anything else that moved.
- [x] **Delete a sheet** from the tab's menu — its entry, and the overrides on
      its cells, which yxl refuses if left dangling. Refused where it is the
      only sheet, where a surviving formula names it (Excel writes `#REF!`
      there; this writes nothing), and where every other sheet sets
      `visibility:`, which is not read yet and so cannot be shown to leave one
      visible (§2). That last refusal tightens into a real check when the
      hide/unhide item below lands.
- [x] **Reorder** by dragging a tab — the `sheets:` sequence is tab order. One
      `write` over the whole sequence, whose inverse is the text it replaced:
      every entry keeps its own bytes and its own comments, and the blank lines
      between them stay where they are rather than travelling with a sheet. A
      remove-and-insert pair would have been unsound, since a sequence's index
      paths shift under the removal and the inverse is read against the tree as
      it was (ADR-026).
- [x] **Hide and unhide** a sheet (`visibility: hidden`), and `very_hidden`
      drawn as what it is and not offered; **tab colour** from the tab's menu.
      Both keys are modelled now rather than opaque, so a hidden sheet is drawn
      faded and italic — Excel takes the tab away, but a preview that hides it
      leaves no way to bring it back. Hiding the last sheet that shows is
      refused, which is also what turned the deletion's `visibility:` guess into
      a real check.
- [x] **Gridlines off** drawn as off, and a switch for it in the tab's menu —
      the sheet's own lines, not a cell's borders (`docs/spec.md` §2). The
      switch takes the key out again where it goes back to Excel's default,
      rather than writing `gridlines: true`.
- [x] **`split:`** drawn as the splitter it is, read-only: Excel's own grey bar,
      where the points say, on each axis the sheet splits. The panes do not
      scroll apart and the bar does not move — a preview that let it be dragged
      would be writing a key it cannot honestly place. The freeze gesture reads
      the modelled `split` now rather than the CST key it stood in for.

### Phase 13 — What decorates a cell
`docs/spec.md` §10 and §11: the constructs that sit *on* cells rather than fill
them. All of them are opaque today (ADR-011) — preserved byte for byte, and
invisible. Ordered by what a real spec turned out to use: the first two came
back from `torchrelay-docs`, where a reader asked why a status column drew none
of its colours and why a header row showed no filter.
- [x] **Conditional formatting** (`conditional:`) — modelled rather than opaque,
      every kind of rule read: the eight `cell` comparisons, the four `text`
      tests, `formula`, `top`/`bottom`, `duplicate`/`unique`, `color_scale`,
      `data_bar`, `icon_set`, with `style`/`format` and `stop_if_true`. The two
      this preview can decide on a cell alone — `cell` and `text` — are
      **applied in the drawing**, over the evaluated value where there is one
      (display only, ADR-014), in the order written, which is Excel's priority
      order. Every rule that reaches the selected cell is named in the
      inspector, and the ones not drawn say so.
- [x] The rules that need the **whole range** to decide — `top`, `bottom`,
      `duplicate`, `unique` — applied too, off the values the sheet actually
      writes rather than the whole rectangle, which may be a column of a million
      rows. `top`/`bottom` rank numbers only, as Excel does, and bring in every
      cell that ties for the last place; a blank counts as nothing. Excel's own
      rounding for `{ percent: true }` is not written down in the schema, so
      this floors it and never takes fewer than one — said here because it is a
      choice rather than a reading.
- [x] `formula` rules applied: one ask per written cell the range covers, the
      formula shifted by that cell's offset from the range's corner, which is
      the shared-formula rule the fills already use. The answers come back on a
      channel of their own — a condition is asked *about* a cell, not held by
      one, and must never become that cell's value (ADR-014). Only a truthy
      value matches; an error or a name the engine has nothing behind matches
      nothing rather than everything.
- [x] `color_scale` and `data_bar` **drawn**, against the thresholds yxl
      actually writes — read out of a built workbook rather than recalled: a
      scale is `min` / `percentile 50` / `max`, a bar `min` / `max`. A scale is
      a fill and goes in as one more style layer, so the inspector answers for
      it like any other; a bar is drawn behind the value, and `bar_only` hides
      the value as it says.
- [x] `icon_set` **drawn** — the thresholds are the evenly spaced percents yxl
      writes (three at 0/33/67, four at 0/25/50/75, five at 0/20/40/60/80, read
      out of a built workbook), `reverse` turns the set round, and `icons_only`
      hides the value. The host picks *which* icon; the view decides what one
      looks like, which is one character and a colour for each of the seventeen
      sets — enough to recognise, never Excel's own rendering (ADR-029).
      With this, **every kind of `conditional:` rule is drawn**, and the
      inspector's "not drawn by this preview yet" had nothing left to say and
      is gone.
- [x] **Auto filter** (`filter:`) — modelled rather than opaque. Every header
      cell wears Excel's dropdown mark, and the cell's own menu offers *Create a
      filter* over the selection's top row or *Remove filter*, one per sheet as
      `docs/spec.md` §10 says. Per-column criteria are not in the schema, so the
      preview does not filter by one and says so on the mark: what is drawn is
      that a filter is there and where.
- [x] **Notes** (`comments:`) — modelled rather than opaque, both forms read: the
      bare text, and `{ text:, author: }`. A cell carrying one wears Excel's red
      corner and says the note on hover, the author before it where one is
      named. *Insert note* / *Edit note* / *Delete note* sit in the cell's own
      menu, and the note is written in a box over the cell, since a webview has
      no dialog to ask in. Which cell already carries a note is read from the
      file rather than from the projection: two gestures inside one redraw would
      otherwise write the address twice. Editing a note written the long way
      changes its `text` and leaves its `author` alone. The note is in the
      inspector too, with where it is written.
- [x] **Hyperlinks** (`links:`) — modelled rather than opaque, both forms read:
      the bare URL, and `{ url: | to:, tip: }`. A cell carrying one is drawn as
      a link and says its `tip` and where it goes on hover; `Cmd`+click follows
      it — a page opens outside VS Code, a `to:` takes the reader to that cell,
      on that sheet. **Which kind of target it is, is never inferred**
      (`docs/spec.md` §10 is explicit that `Summary!A1` and a URL are both just
      text), so the menu asks: *Link to a page…* and *Link to a cell…*, and
      *Edit link* keeps the kind it was written with, and its `tip`. Only
      `http`, `https` and `mailto` are opened — a spec is a file, and a file may
      come from anywhere. The link is in the inspector with where it came from.
- [x] **Data validation** (`validations:`) — modelled rather than opaque, every
      kind read: `list:` as the choices themselves or the cells holding them,
      and `whole` / `decimal` / `text_length` / `date` in the comparison a
      `cell:` rule is spelled in, which is now read by one function for both. A
      `list:` wears the dropdown and offers its choices when the cell is typed
      into — the written value of each cell, never a computed one, since a
      choice picked is a value written (ADR-014). The other kinds wear a quiet
      corner and say what they ask on hover, the `prompt` first. *Data
      validation…* over a selection writes a `list:`, the kind a reader makes by
      hand; a range that already has one is refused rather than given a second.
- [x] **Tables** (`tables:`) — modelled rather than opaque: the region, the name
      formulas call it, the style, and the four Table Design toggles. The region
      is drawn as Excel bands one — the header row filled and carrying the
      filter buttons a table brings with it, the stripes each toggle asks for
      beneath, and a cell's own fill above either, since a table style sits
      under direct formatting. *Format as table* over a selection writes the
      entry with the next free `Table<n>`, the name Excel gives a new one. What
      a region has to be to hold a table is refused first rather than left to
      Excel's repair: a header row that names every column as text with no two
      names alike, no overlap with another table or with the sheet's own
      `filter:`, and a row under the header. Structured references (`SUM(Revenue[Revenue])`)
      were already left alone by `moved` and `shifted`, and now have a test on
      each saying so.
- [x] Each of these **in the inspector** with where it came from, the day it is
      drawn — provenance is what makes the rest editable later (ADR-005)

### Phase 14 — What sits on the sheet
Charts, images, sparklines and shapes — all four are in the spec already
(`docs/spec.md` §12, §13, §18, §19). This editor carries them through untouched
(ADR-011) and draws nothing of them, which is the largest hole in the preview.
- [x] Each of them **drawn** where it sits and at the size it takes, with enough
      of the thing to recognise — never Excel's rendering of it (**ADR-029**)
      **In**, all four modelled rather than opaque and each drawn as what it is.
      A **chart** is an outlined box with its title, a legend on the side it
      asks for naming every series — by its `name`, or by the cell `name_from`
      reads, or by the range it plots — the axis titles along their own edges,
      and a mark of its own type: bars, a line, an area, dots, or slices. In
      greys, never Excel's palette, and what it cannot fit it says on hover.
      An **image** takes the room its own file says it takes: the host reads the
      extent out of the header — PNG, GIF, BMP, JPEG, SVG — rather than
      decoding one, and where the format says nothing the plate says so instead
      of guessing an extent. A **shape** is the preset geometry it names, drawn
      as an outline of it in the `fill:` and `line:` the spec asks for, with its
      text over it a line at a time in the font each line wears. A **sparkline**
      is drawn inside the cell it sits in, from the values the sheet holds —
      evaluated where there are any, display only (ADR-014) — as a line, columns
      or win/loss, with the axis at zero and the marks the group picks out.
      **`positioning:` is read and not yet drawn**: nothing in the preview moves
      the cells under a float, so the three anchors have nothing to tell apart.
- [x] Inserting one: a chart over the selected range, an image from a file
      beside the spec
      **In**, both from the cell's own menu. A **chart** over the selection
      reads it as Excel reads a table: the left column labels the points, every
      column beside it is a series, and the top row names them where it is text
      over values. Which *shape* it takes is not in the selection, so it is
      asked rather than picked (ADR-001) — eight answers, one per shape, and a
      stacked variant is the same entry with the word changed. It floats one
      empty column past the cells it plots, since a chart over them hides them.
      Refused over one column, which has nothing to plot against its labels.
      An **image** is picked in the editor's own file dialog — a webview has
      none, and resolving a path is the host's job (ADR-004) — and written
      relative to the spec, with `/` whatever the platform, since that is how
      yxl resolves one (`docs/spec.md` §9, §13). A format Excel does not decode
      is refused by name rather than written for the compiler to reject.
      Both claim **no cell at all**: a float sits above the grid and changes
      nothing under it, so the checker's expectation is `nothingChanges`.
- [x] Moving and resizing what is there, as an edit to the construct's own
      anchor rather than to a picture
      **In**, by dragging the float itself and by the corner it grows from.
      Both send **once on the way up**: every step of a drag would be an edit.
      A move rewrites the entry's own `at:` and nothing else — the drop lands on
      a *cell*, since that is what an anchor is, and the `offset:` an image
      already carries comes off before the cell under the corner is looked up,
      so the corner lands where it was dropped. A float anchored where a
      parameter says is **refused rather than written over** (`docs/spec.md` §7).
      A resize writes what the construct itself says: a chart's and a shape's
      `size:` in whole pixels, and an **image's `scale:`**, which is a factor
      over the file's own size — so the host measures the file first, an image
      it cannot measure is refused with the reason, and a drag back to the
      file's own size takes the key off rather than writing `scale: 1`.
      The entry is named to the view by its **`NodeId`**, not by its place in
      the sequence: a malformed entry earlier in the file would shift an index,
      and an id survives an `$include` too.
- [x] What is still unmodelled stays opaque and byte-identical while it waits
      **Held, and now proved against the writes that sit beside it.** The
      preservation suite carried its constructs through a *cell* edit; a float
      is written under the **sheet**, which is exactly where the nine keys this
      editor still carries live, so it now carries them through a chart put in,
      an image put in, a float moved and a float resized as well — every one of
      them byte-identical and in the order the spec wrote them, over yxl's whole
      corpus. The suite also **names those nine** (`active`, `background`,
      `calc`, `controls`, `pivots`, `print`, `properties`, `protect`, `slicers`
      — `docs/spec.md` §5, §13, §14, §15, §16, §20, §21), so modelling one is a
      change somebody makes on purpose rather than one that goes unnoticed.
- [x] **A comment at the end of a sheet is left behind by a key added after it.**
      Found while proving the above. Adding a key to a sheet mapping landed it
      at the end of the *last entry's* line, which is **before** a trailing
      comment at the mapping's own indentation — so `# the pivot above is not
      modeled yet` ended up under the chart that went in beneath the pivot. The
      bytes all survived; what moved was what the comment sat next to, and a
      comment that says "above" is then about the wrong thing.
      **Fixed in `cst`, where it belonged**: `belowComments` is `aboveComments`
      read the other way, and the three places that append — a key with a block
      under it, a key with a scalar, an item at the end of a sequence — go in
      past the comments that belong to what they follow. Two rules decide what
      belongs: a **blank line ends the run**, which is the rule `aboveComments`
      already used (a comment set off by one is a heading for what comes next),
      and a comment **indented less than the entry** is the outer level's, not
      this mapping's. A sequence measures at the `-` rather than at the content
      it opens, since that is where an item's own comments sit.

### Phase 15 — The rest of the schema, honestly
What is left of `docs/spec.md` once the phases above are done: `print:` (§5),
`protect:` (§16), `background:` (§13), form controls (§20), slicers (§21),
pivots (§14), document properties and calculation (§15), and `rich:` *editing*
(§3 — it is drawn today). None of it is an ordinary day's gesture; each is
either **previewed and read-only** or **opaque and said so** — and the v1.0
coverage table below is generated from which.
- [x] Every sheet and document key in the spec is in one of three states in the
      code — editable, preview-only, opaque — and the README's table is
      generated from that, so it cannot lie
      **In**, as `spec/coverage.ts`: ten document keys and twenty-eight sheet
      keys, each with what this editor does with it and a sentence saying what
      that comes to. Three checks keep it honest, and each was **made to fail
      before it was trusted**: the list is exactly what upstream's own
      `docs/yxl.schema.json` declares, in its order, so a key the schema grows
      is a failing test rather than a silence; **`opaque` is a consequence, not
      a claim** — a key `MODELED_KEYS` does not list *is* carried, and the table
      is checked against that rather than believed; and the README's block is
      compared against the rendered table, `COVERAGE=write` writing it.
      What is left is the one claim a machine cannot make: **editable against
      drawn**. That one is a sentence per key, in the code, where the gesture
      that would falsify it lives.
- [x] `print:` and `protect:` previewed: the print area outlined, the locked
      cells marked
      **In**, both modelled rather than opaque. The **print area** is outlined
      where it falls and each `breaks:` cell draws the two lines it starts a
      page with — above it and left of it, and neither where that is the sheet's
      own edge. Everything a line in the grid cannot say — the way round, the
      margins in inches, the scaling, the `&`-coded running heads — is said
      under the grid, ending in *it does not paginate*, because a preview that
      drew pages would be drawing Excel's arithmetic rather than the spec's
      words. `scale:` and `fit:` are refused together, and a break at `A1` is
      refused, as `docs/spec.md` §5 says.
      **The marking is the other way round from the wording above.** Excel locks
      every cell, so a sheet under `protect:` has nothing worth marking except
      the cells a style *unlocks* — the input boxes of a form, which is what §16
      says the key is for. Those are outlined; the sentence under the grid says
      the sheet is locked, whether a password stands behind it, and what is
      still allowed. **The password itself never leaves the compiler**: what is
      projected is that one is set. A spec is version-controlled and §16 says to
      pass one with `--set`; a preview that echoed it would undo that advice.
      **The mark says what *Excel* will do, and says so.** Reviewing this, the
      first cut drew the unlocked cells as a filled outline, which reads as a
      selection — as though the preview had made them the editable ones. It is a
      corner mark now, like the other things a cell wears, and the sentence
      opens *When Excel opens this sheet…* and closes *Editing the spec here is
      unaffected*. `protect:` is about the workbook; the person editing the spec
      is the one who wrote the lock.
- [x] **A parameter cannot fill a spelling this loader reads.** Found while
      adding `print.orientation`, which the schema lets a `${...}` fill.
      `expectSpelling` read the *raw* text against a closed vocabulary, so a
      placeholder was refused as an unknown spelling — while yxl built the spec
      happily. Confirmed against three of them: `sheet.visibility`,
      `cells.type` and `images.positioning` each raised
      `loader.unknown-spelling` on a spec that compiles upstream.
      **Fixed the way `print.orientation` already was**: `spelling(vocabulary)`
      makes a closed vocabulary into a `Kind`, so every one of them is read
      through the template-aware `readAs`, and `expectSpelling` is gone. Twelve
      fields became `Templated<T> | null` — a cell's `type`, a sheet's
      `visibility`, a border edge's `style`, both alignments, a chart's `type`
      and `legend`, a shape's `kind`, a float's `positioning`, a sparkline's
      `type`, and how a validation refuses a value — and each is resolved in
      `compile` by one `spelling(ctx, said, vocabulary, node)` that reports
      `compile.bad-spelling` where the parameter fills something else. What
      happens then is the same answer the key gives when it is absent: the
      default where it has one, and the construct dropped where the spelling is
      what makes it (a chart's type, a shape's geometry, a sparkline's kind).
- [x] `rich:` runs editable in the formula bar, one run at a time
      **In**: the bar over the grid grows a picker where the cell holds runs —
      `1. Figures are`, `2. unaudited` — and the box beside it holds *that run's*
      text, sent back as `editRun`. `setRun` writes it where the run is written:
      the item itself for a bare string, its `text:` for a run that wears a
      font, which is left alone. Three things are refused rather than guessed
      at: a run that reads a `${...}`, since typing over it would take the
      parameter away; a run with nothing to say, which would leave a sequence
      upstream refuses; and a run the cell has not got.
      **Typing over the whole cell is refused now**, where it used to write a
      `value:` beside the `rich:` — a spec `yxl build` rejects (`docs/spec.md`
      §3) and this loader rejected too, so the write path was making a file its
      own reader would not take. The refusal names the bar; the cell says the
      same on hover and in the inspector.
- [x] The rest stays opaque, and the inspector says so where a cell is under one
      **In**: a sheet's carried keys ride through `compile` as `carried` and the
      inspector lists them under *This sheet also holds, undrawn:* — one line
      per key, saying what it is in the coverage table's own words, each a
      button that goes to the lines. On yxl's own corpus that is `pivots` on
      `pivots.yxl.yaml`, `controls` on `interactive`, `background` on `layout`
      and `slicers` on `modular`: every opaque sheet key there is, said.
      **It is about the sheet, not the cell, and says so.** Where the construct
      sits is not read — reading a pivot's `at:` would make the key modelled and
      move its row of the coverage table out of *carried*, which is the next
      phase's decision to make, not this one's. So the cell's own answer is
      untouched: a blank cell under a pivot still says *Nothing writes this
      cell*, and the carried list sits below it under its own heading.
      **A key the schema has not got** — a spec's own typo — lands in the same
      list, saying `a key this editor does not read`. The document's carried
      keys (`active`, `properties`, `calc`, `protect`, `default_font`) are not
      here: a cell is not under them, and the README's table is where the whole
      schema is said.

### Phase 17 — What a reader hit first
Opened 2026-08-29 from a reader's own list, with screenshots, after working in
the preview on yxl's examples. Five things: four are defects with a cause named
below, and one is the answer panel becoming a thing you have to answer.

- [x] **A preview that comes back when its tab does.** Two previews open in the
      same column; the one that loses the tab comes back **blank**. The panel is
      created with neither `retainContextWhenHidden` nor an
      `onDidChangeViewState` listener, so VS Code tears the webview down when it
      is hidden and reloads the page when it returns — into a view that has
      never been sent a drawing, and a host that only sends one when the text
      changes.
      **Both, and each for its own reason.** The *fix* is a handshake: the view
      posts `ready` as its last act of wiring, and the host answers with the
      drawing it already holds — which is what makes a first load deterministic
      too, since a message posted before a webview is listening is dropped. The
      *flag* is separate and is about the reader rather than correctness:
      `retainContextWhenHidden` keeps their selection, their scroll and their
      open menu, none of which the host has to send back. The grid draws a
      window rather than a sheet (ADR-019), so what is retained is bounded.
      **And a `WebviewPanelSerializer`**, for the other way a panel goes empty:
      a window reload. The view keeps the one thing it cannot be given back —
      the spec it was drawn from — in VS Code's own `setState`, and a revived
      panel is handed to a `Preview` that starts as any other does. A state
      with no file in it, or a spec that has been moved since, closes the panel
      rather than showing an empty grid.
- [x] **The answers to a refused edit, as something you have to answer.** They
      were a panel under the grid, and the grid behind it still took keystrokes —
      so a reader could not tell whether their edit had happened. It is a
      question over the panel now: the first answer takes the keyboard, `Tab`
      goes round the answers rather than out of them, `Esc` and *Leave it as it
      is* take it back, and a click on the ground behind it is absorbed rather
      than being an accidental dismissal of a question about the reader's own
      edit. Everything it carried came with it — each answer's count and sample
      cells (§8 Q14), the exception, and the reason that goes in the file beside
      it.
      **Two rules the move needed.** An answer taken closes it *at once* rather
      than waiting for the host's reply, since the reader has answered and the
      question is over; and a **drawing closes it**, because the answers were
      worked out against the text as it was, and a spec that has changed since is
      not the one the question was about. A redraw with the same question open
      leaves it alone, or it would take back the keyboard and the half-typed
      reason.
      **Not `<dialog>`.** `showModal()` is the right element and gives inertness
      for nothing — and **jsdom 30 does not implement it** (measured, not
      recalled), so the shipped path would have been the one no test runs. The
      focus trap is ours, and every rule above has a test.
      **The one thing a test here cannot see is a colour.** *Leave it as it is*
      first went out as a control with a ground of its own and a foreground
      borrowed from the description text — grey on grey, and a reader said so.
      It is the editor's own button pair now, falling back to the primary pair
      where a theme declares no secondary one, so the two always come from the
      same place. jsdom does not resolve `var()`, so no test here can tell: this
      one was found by looking, which is the only way it could have been.
- [x] **A command a reader can find.** *Open Preview to the Side* named neither
      yxl nor a grid, and it was a text button in the editor's title bar.
      **In**: *Open the Grid Beside the Spec*, which says what it opens — the
      palette says `yxl` for it already, so the title does not — behind a
      `$(table)` in the title bar. The trip back is a command of its own, *Go to
      the Spec Behind the Grid*, in the *preview's* title bar under
      `activeWebviewPanelId`, which puts the reader back in the editor the spec
      is already open in rather than opening a third column.
      **A suite for the manifest**, since no other one can see it: a command a
      menu names and nothing declares is a button that does nothing, a title-bar
      button with no icon is the line of text a reader could not place, and a
      command declared and never registered is a palette entry that answers
      nothing. `yxl.keepKey` is the deliberate exception the suite names — bound
      and registered and *undeclared*, because a key taken from VS Code is not
      an offer to a reader (ADR-046). Two of its four checks fail on the old
      manifest.
- [x] **`Cmd`+arrow reaching the sheet's edge, not the window's.** `edge()` in
      `webview/keys.ts` walked the cells of the **drawn window** (ADR-019), so a
      column longer than the window stopped where the drawing stopped.
      **ADR-043's shape again**: the key names the *step* (`edging`) and the
      host answers with the *address* (`edges.ts`, over every cell the sheet
      holds), which the view then goes to — through the same `goToCell` that
      already moves the window when the answer is outside it. `Shift` rides on
      the question and comes back on the answer, so neither side has to remember
      what was asked. The walk that was in the view is gone rather than left
      beside the new one; its three tests moved to the host, where the case that
      started this — four hundred rows, of which fifty are drawn — is one of them.
      **`Home` and `End` went the same way**, a day later and at a reader's
      asking rather than when it bit: `End` read the drawn window too, and the
      message now names *which* far end a key wants — a block in a direction,
      the row's, or the sheet's — so all three are one question with one answer.
      `Cmd`+`End` came with it, since the host that knows the row's last cell
      knows the sheet's corner. `Home` needed nothing: the first cell of a row
      is where it is whatever is drawn.
      **The view no longer reads the window to move at all**: `going` lost the
      cells it was handed, and the fixture that built them went with it.
- [x] **A copy that reaches past the window** — the line above's own
      consequence, found the same afternoon by the reader who asked for it. A
      selection could not run past the drawn window before, so *this reaches past
      what the preview has drawn* was a sentence nobody met; with
      `Cmd`+`Shift`+arrow reaching the sheet, it is what a reader gets for
      selecting a column and copying it.
      **The host writes that one, as values.** Two flavours can only go on the
      clipboard inside the gesture (ADR-035), and a round trip is not inside one
      — so the view keeps the look for a rectangle it has drawn and asks the host
      for one it has not. What comes back is the text the host wrote, which is
      what tells a later paste whose it is.
      **And the keyboard after a long jump.** The drawing that answers a window
      the view asked for put focus back only where the page happened to still
      have it; the view asked for that window, so the reader is in the grid, and
      the first key after the jump now reaches a cell rather than the page.
- [ ] **Where the keyboard is, decided in one place.** Two of the defects above
      were the same defect: a control took the keyboard and nothing put it back
      (the question), and a redraw put it back only where the page happened to
      still have it (the window jump). Both passed every test, and both were
      found by a reader. Focus is decided in `draw`, in `restate`, in the cell's
      own box, in the tab's rename box and in the question — five places, no two
      of which can see each other. One rule instead: *the grid has the keyboard
      unless something the reader opened has it*, said once and asserted once.
- [ ] **What crosses the window's edge, pinned by tests.** The other two were
      also one: the view holds a window (ADR-019) and every gesture that reaches
      past it has to ask the host — which `fit`, `sum`, `edge` and now `copyOut`
      each do, and which selecting, `End`, and the next such gesture do not.
      A suite over *the boundary itself*: for each gesture, a sheet whose block
      runs past the drawn window, and the answer that must not be the window's.
      Both of these are how this phase stops producing the next one.
- [x] **A column width Excel agrees with** *(lower priority — the reader said
      so)*. Two errors, one arithmetic and one font. `PER_CHARACTER = 7` turned
      pixels into Excel's unit but dropped the 5px Excel's own formula adds,
      while the measurement put our `AROUND = 10` in — so a fitted column was
      about two thirds of a character wide before any question of font.
      **The arithmetic is Excel's now**, in one constant: a width is a count of
      `0`s and a cell keeps five pixels around them, so 8.43 draws as the 64
      every workbook opens with rather than as 59. The cell's own padding went
      from four pixels either side to **two**, which is Excel's, so a width
      means the same thing in both — and a fit, which measures the text and adds
      that same five, lands on exactly the width Excel's own AutoFit would.
      **Twelve tests carried the old numbers** and say the new ones with the
      rule beside them; the round trip a drag makes — px to width and back — is
      pinned at Excel's default in `window.test.ts`.
      **The font half is not fixed and cannot be here** (§8 Q19): the canvas
      measures whatever face the reader's machine substitutes for Calibri, which
      on macOS is not Calibri. A fitted width is this editor's best guess at
      Excel's, and the README's table will say so.

### Phase 18 — From nothing to a workbook
The two ends of a reader's day. Neither is in the editor today, and both are
small — which is why they are one phase and not two.

- [ ] **A new spec from nothing**, by running `yxl init` — *blocked on upstream*,
      [yxl#77](https://github.com/t-ujiie-g/yxl/issues/77), filed 2026-08-29.
      **Reversed on the day it was written.** The first answer was a template in
      this extension, on the reasoning that a starter is an editor affordance
      and `yxl 0.3.5` has no `init`. A reader said the other thing, and they are
      right: a starter spec is a statement about the **format**, and the format
      is upstream's. Kept here it is a second copy that drifts, and it is out of
      reach of anyone using the compiler without this editor — which is the
      argument that already puts `extract` there rather than here (ADR-011).
      **What the day taught, and what the issue carries**: the starter should be
      an **empty sheet**, not a worked example. A heading row, sample rows and a
      `SUM` look helpful and are not — the reader deletes them before they can
      begin. `sheets:\n  - name: Sheet1\n` compiles and builds today, checked,
      so the command is small.
      **What this editor then does** is run it, as it runs `build` and
      `extract`, and degrade with a sentence where the pinned CLI has no `init`
      (§8 Q6).
- [ ] **Where a reader finds any of it.** The command palette is where a command
      goes to hide — said by the reader who could not find *New Spec* there.
      Whatever makes a spec belongs in **`file/newFile`** (VS Code's own *New
      File…*, and the Welcome page's list) and in the explorer's context menu on
      a folder; whatever acts on one belongs in a title bar. Written down here
      because it is a rule about every command this editor adds, not a note
      about one of them.
- [x] **Build where it can be clicked.** `yxl.build` already built to a sibling
      `.xlsx`, offered *Open it*, warned about a version mismatch in both
      directions, and answered a missing compiler with the install link — from
      the command palette and nowhere else.
      **In both title bars now**, `$(package)` and `$(check)`, on the spec's own
      editor and on the preview, since the text and the grid are two views of
      one spec and a command about the spec belongs wherever the reader is
      looking at it. The manifest suite pins that: a `when` that names one
      surface and not the other fails it.
      **Which spec, decided by what has the keyboard.** `activeTextEditor` holds
      the last text a reader touched, which may be another spec entirely — so a
      grid *in front of them* is the subject where there is one, and the text
      otherwise. `panel.active` is the live answer; the panel this editor
      remembers is only the last.
- [x] **The spec's own schema in the *text* half** *(proposed, not asked for)*.
      Upstream generates `docs/yxl.schema.json` (§8 Q7); a `yamlValidation`
      contribution points the YAML extension at it, and a reader gets completion
      and inline errors in the half of the editor this project does not draw.
      **The schema is carried rather than fetched**, for two reasons: a reader
      on a train still gets it, and §8 Q6 pins this editor to *one* yxl version
      — validating the text against whatever `main` says today would be a
      different rule from the one the compiler and the loader follow.
      **A copy is only safe while something checks it**, so a test compares it
      byte for byte with the checkout next door and says how to take a new one
      (`SCHEMA=write`), which is the same shape the README's coverage table
      uses. A version bump takes the schema with it, in the same commit.
      **It needs `redhat.vscode-yaml`**, which this editor does not depend on:
      the contribution is inert without it and everything else still works.
      Saying so is Phase 20's README line rather than a forced install.
- [x] **Replace what a find turned up** *(proposed)*. `Cmd`+`F` finds; a
      spreadsheet replaces. The find bar takes what goes in the place of it, and
      offers *Replace* — the one the reader has gone to — and *Replace all*.
      **The refusals were the interesting half, and they came for free.** A
      replacement is an ordinary cell write, so `landed` already knew how to
      write many of them as one edit and count what stood in the way by group
      (§8 Q14) — a `formulas:` range's anchor is *found* by a search and is not
      something a replacement may write, since changing the formula there
      changes every cell it fills. What `landed` needed was its own words: the
      verb a refusal counts in is a parameter now, so *pasted*, *filled* and
      *replaced* are one function.
      **What is replaced is what was searched** — a cell's value, or a formula's
      body, as `finds` matches them — and the new text is read the way a
      reader's keystrokes are, so `2400000` with `24`→`25` stays a number rather
      than becoming a string of digits.
      **A cell found by the value *cached* under its formula is counted, not
      passed over.** Found while a reader replaced 45 cells and was told 44 were
      written: `finds` matches what a cell holds, which for a formula cell
      includes Excel's own answer, and typing over that is writing down a guess.
      It refuses with the rest of its group, and *Replace the ones that can be*
      is the answer — the same shape a paste has had since Phase 11.
      **And a search a reader can close.** `Esc` worked only inside the box it
      opened, so a reader who had gone back to the grid had no way out; there is
      a `✕` on the bar and `Esc` answers from anywhere in the panel. The bar
      wraps, as the toolbar does — with two more controls on it, *Replace all*
      was off the edge of a narrow panel.

### Phase 19 — 日本語 and English
Asked for on 2026-08-29 by a reader working in Japanese. The work is not
translation but **where the words are**: today they are English prose built at
the place the thing goes wrong, which is the one place a second language cannot
reach.

- [x] **The decision first (§8 Q18)**, as an ADR: a diagnostic and a refusal
      carry a **code and its parts** and are worded at the edge — **ADR-051**.
      With it, the mechanism `diag` owns: a `Says` type per package mapping each
      id to what fills it, a book of sentences per language beside it, and a
      reader at each edge. `cst` and `patch` are converted, which is what proves
      it; `Saying = string | Message` carries the rest until they follow.
- [x] `package.nls.json` for the manifest — the commands and the setting —
      which is VS Code's own mechanism and needs no decision.
- [x] The view's chrome: the toolbar's tooltips, the menus, the headings under
      the grid, the formula bar, the inspector's facet names, the sentences a
      preview says about `print:` and `protect:` — 140 sentences, in the panel's
      own book (`webview/src/text.ts`), worded by `chrome()` off `<html lang>`.
- [ ] Every refusal and every diagnostic, which is the long tail and the reason
      the decision comes first. **Done: every refusal** — `intent`'s 122 and the
      host's own, with the answers they offer. **Left: the diagnostics** —
      `loader` and `compile`, 94 sites behind `reject`, and `units`' formula
      prose that a refusal still quotes verbatim.
- [x] The language follows VS Code's own (`vscode.env.language`); no setting of
      our own until somebody asks for one. The host sets `<html lang>` from it,
      and the view reads it from there.
- [ ] **What stays English, and is said so**: the schema's key names, the
      `docs/spec.md` references, and the compiler's own output, which is yxl's
      to translate rather than ours to paraphrase.

### Phase 20 — Shipped
The manifest is `private: true` at version `0.0.0`, so nothing can publish it by
accident. This is §8 Q6's open half, and the v1.0 gate's last line.

- [ ] A publisher, a version, and `private` off
- [ ] An icon, keywords, `repository`, `bugs`, and the licence in the
      **package's own** manifest
- [ ] The extension's own `README.md`: the marketplace shows the package's, not
      the repo's. What it is, what it needs (`yxl` on `PATH`, the pinned
      version), and §2's list of what it is **not** — the honest description the
      v1.0 gate asks for
- [ ] `CHANGELOG.md`, and the rule that ties a release to the pinned yxl (§8 Q6)
- [ ] `.vscodeignore`, and a `.vsix` that installs on a machine that has never
      seen this repository
- [ ] It collects nothing, and the README says so
- [ ] Tiers 1–4 green in CI, Tier 5 performed on a real workbook (§5)
- [ ] **A `customEditors` contribution at `priority: option`** *(proposed)*, so
      *Open With…* offers the grid on a `*.yxl.yaml` without a command

### Phase 21 — Deterministic refactors *(lowest priority)*
Kept last on 2026-08-23, and **numbered for that place on 2026-08-29** — this was
Phase 16, and a phase that runs last while carrying the lowest number is one
every reader has to work around. Why it is last: this is spec hygiene rather
than a spreadsheet gesture, which is not what the project is for (§1) — but it
is model-free, it is what principle 6 looks like when it acts rather than waits,
and Phase 11's `data:` conversion is its first row already shipped. Everything
here is detectable by analysis.
- [ ] Identical resolved styles at N sites → extract to `defs.styles`
- [x] Homogeneous `cells:` rectangles → `data:` with inline `values:`
      *(Phase 11, 2026-08-23, as a gesture on the rectangle)*
- [ ] Columns of translated formulas → a `formulas:` range
      *(half there: Phase 11's fill offers the range for a new column; the
      refactor is the same answer over a column that already exists)*
- [ ] Accumulated `overrides:` sharing a pattern → a definition
- [ ] All of the above gated on **`expectedDiff: empty`** — a refactor that
      changes one rendered cell is rejected, automatically (ADR-009)
- [ ] Presented as reviewable proposals with a diff, never applied silently

### Taken out (2026-08-23)
Two phases that were here are not any more, and not because they were hard:

- **An assistant** — natural-language edits, naming, parameterization proposals,
  behind a provider seam. A VS Code extension is a poor home for one, and it is
  not what this project is for. The machinery it would have needed (§4.6's gate,
  `Patch` as the only way in) is there for the refactors and stays.
- **Beyond VS Code** — a Tauri shell, a standalone file association. Nothing in
  the architecture blocks either (ADR-004, §8 Q8), and nothing in this plan will
  make room for them. If the demand appears it is a different project that
  reuses these packages.

### v1.0 — Stability gate
- [ ] Schema coverage stated honestly: which of `docs/spec.md`'s 23 sections are
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
ADR-003, and is what makes another shell a packaging change instead of a rewrite. CI
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
legible signal that the spec's shape is wrong, and the refactor phase can
propose folding them back in.

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
produced it. That is what makes the assistant safe with a small local model: the model
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

### ADR-027 — A removed entry is put back as the lines it was, and takes its comment block with it
**Accepted.** The inverse of `remove` is `restore`, which writes back the exact
text the removal took out, at the place a sibling names. A removal takes the
comment block directly above the entry and the blank line directly under it;
`restore` puts all of it back.

*Why:* ADR-026 said the inverse puts back text rather than a value, and `remove`
was the one op still inverting to a value — `add` re-rendered what it put back,
so `'007'` came back as `007`, and an entry holding a mapping had no value to
re-render at all. One op that carries lines answers both, and is what a
structural edit needs anyway.

*Why the comment goes too:* a comment above an entry describes that entry. Left
behind, it lands on whatever follows and now says something false about it —
and there would be no way to say "under that comment" when putting the entry
back. Taking the pair keeps the removal honest and the inverse expressible. The
same rule already decided where an `insert` lands, so there is one rule about
comments in this layer, not two.

*What it costs:* two layouts are refused rather than reversed, both of them
about lines that stay behind — an entry with a blank line between it and the
one before it, when it is the last entry; and an entry that is the only one in
its collection. Refused, per ADR-026, rather than put back somewhere close.

*What it found:* two defects the round trip over the corpus surfaced at once.
Removing the entry written on a `- ` line took the dash with it and left the
rest of the mapping dangling — now refused, because moving the dash to the next
entry is a structural edit. And a removal whose value was a block scalar took
the *following* entry's line as well, because a block body ends where the next
line begins.

### ADR-028 — The clipboard is a spec edit, in the formats the other spreadsheets speak
**Accepted.** Copying out puts **both** `text/plain` (tab-separated) and
`text/html` on the clipboard. Pasting in reads both — values from the TSV, look
from the HTML — and lands as **one** resolution over the whole rectangle rather
than an edit per cell.

*Why both:* Excel and Sheets each put both on the clipboard and each read both.
TSV alone arrives as text with every number format and every colour gone; HTML
alone is a table whose numbers have already been formatted into strings. The
pair is what the two applications use to talk to each other, and it is the only
way a paste can carry `1234.5` *and* the fact that it was shown as `1,234.50`.

*Why one resolution:* a paste is the biggest edit anyone makes, and asking about
each of six hundred cells is not a dialog, it is a wall. The rectangle has one
shape question — a `data:` block, or `cells:` entries — and it is asked once,
with the size of the diff each answer would make (§4.4, §8 Q11).

*What does not change:* the paste is a write like any other. It passes the
normalizer, it passes the verification loop, and its inverse is the patch that
takes it back. A paste that would change a cell it did not name is refused, the
same as a keystroke that would.

*What it costs:* a fidelity ceiling. What the HTML flavour does not say, we do
not know — and what we do read of it, we read the same way for both
applications rather than sniffing which one wrote it (§8 Q11).

### ADR-029 — What the preview draws of a chart is a sketch, and never a source
**Accepted.** For a chart, an image, a sparkline or a shape, the preview draws
**where it sits and what it is** — the anchor, the extent, the type, the series
it names — from the spec's own words. It does not render what Excel will render,
and nothing about the drawing is ever read back into the spec.

*Why:* two renderers of the same chart differ, and a picture that looks
authoritative while being wrong is worse than an outline that is honest about
being one. This is the computed value's rule (ADR-014) applied to pixels: what
we produce for the eye never becomes what the file says.

*What it buys:* the largest hole in the preview closes cheaply. A reader who
sees a labelled rectangle where the chart is knows the sheet's layout, can move
it, can put another one beside it — none of which needs the chart to be drawn
accurately, and all of which is impossible while the region is invisible.

*What it costs:* the reader must open the built workbook to see the chart
itself. The preview says so, in the same voice it says a formula was not
computed.

### ADR-030 — The grid's undo is this editor's own while it still holds the file, and the shell's the moment it does not
**Accepted.** `Cmd`+`Z` in the grid takes the last edit back *in the file* —
the step's inverse patch, through the verification loop, applied as a
`WorkspaceEdit` — on one condition: the file is byte-for-byte what this editor
left it at. Where it is not, the gesture goes to the editor's own `undo`
command, as it did before, focus round trip and all.

*Why the guard:* a `WorkspaceEdit` lands on the text document's undo stack, so
there are two stacks over one file and only one of them can be right at a time.
"This editor wrote the bytes that are there now" is the condition under which
its history describes the file, and it is cheap to check exactly. Anything
weaker — undoing an AST step against text somebody else has moved — is the
editor guessing which of two histories the reader meant.

*What it forced:* once the grid's own undos have unwound this editor's history,
the *shell's* stack holds those undos as edits of their own, so falling back to
it would put the edit on again rather than reach past it. The grid says there is
nothing left to take back and stops. What came before this editor's first edit
is still undoable — from the text editor, where it was typed.

*What it costs, and does not:* one gesture is answered by two mechanisms, which
is a thing to explain. It costs no authority: the undo is a write like any
other, gated by ADR-009's loop against the cells the forward edit moved, which
is why `patch`'s history now records those cells and applies nothing itself —
a history that applied its own patches would be the one path around the loop.

### ADR-031 — A formula is moved by scanning it, not by parsing it, and one that cannot be moved with certainty is refused
**Accepted.** `units.moved(formula, by)` returns the formula as it applies a
number of columns and rows away. It scans the text into words, quoted strings,
and bracketed table references; it moves the words that are cell references and
returns everything else byte for byte. It never builds a syntax tree and never
learns what a formula *means*.

*Why a scanner:* the only question a move asks is *which of these words are
references*, and that is decided by the shape of a word and the character after
it — a `(` makes it a function, a `[` a table, a `!` a sheet. A parser would
answer a question nobody asked, and would have to be kept correct against
Excel's whole grammar to answer the one that was.

*Why not the evaluation engine's parser:* ADR-014 puts evaluation behind a seam
and unreachable from every write path, and a moved formula **is** a write. The
shift belongs beside the addresses it rewrites, which is `units`.

*What "with certainty" rules out:* a reference that would leave the sheet, and a
quote or bracket that never closes. Both are refused with the word that stopped
it, rather than moved to something Excel would read as `#REF!` or worse. This is
ADR-026's rule — an edit that cannot be expressed is not made — applied one
level down.

*What has no oracle here, and what stands in its place:* yxl does not translate
references at all. A `formulas:` range compiles to Excel's own shared formula
(ECMA-376 §18.3.1.40) and **Excel** shifts it on open, so there is nothing in
the MoonBit core to compare against (ADR-012 does not reach this). The authority
is Excel's behaviour, and the substitute for the oracle is the case list: the
`$` anchors, the padded row that survives, a string that reads like a reference,
`LOG10(`, a table's nesting, `A:A`, `1:10`, and both edges of the sheet.

*What it does not do:* R1C1, and a reference written in lower case comes back
upper — which is what Excel stores, and the only byte a move changes that the
reader did not ask it to.

### ADR-032 — What is copied is a place, not the cells in it; a paste inside the grid lands as `cells:` entries
**Accepted.** `Cmd`+`C` remembers a sheet and a rectangle. It does not read the
cells, and it holds no values. `Cmd`+`V` sends both places to the host, which
works the whole paste out from the file **as it stands at that moment** — one
`EditIntent`, through the same checker as a keystroke.

*Why a place:* a buffer of cells is a copy of the spec that goes stale the
instant anything else edits the file, and the grid is not allowed to hold spec
state (ADR-001). A place cannot go stale — it can only stop being a place, which
the resolver says out loud. It also means a copy survives a redraw, an
`$include` being edited under it, and an undo, for free.

*What lands:* what each cell **holds** — its value, or its formula with the
references moved (ADR-031). What the cell it lands on **wears** stays: `style:`
and `format:` are untouched, which is the mirror of the rule emptying a cell
already follows. A paste therefore carries no looks at all; the toolbar that
would make that meaningful is Phase 9, and doing it before the normalizer exists
(ADR-008) would scatter anonymous styles through the spec.

*Where nothing is written yet:* `cells:` entries, which is §4.4's `empty` row
answered for a rectangle rather than a cell (§8 Q11). The `data:` rectangle is
the better shape for two hundred rows from a report, and that is the paste that
should decide it, against a real clipboard.

*What it refuses:* a hole in the source stays a hole — an empty cell pastes
nothing rather than emptying what it lands on, because destroying a cell nobody
named is the one thing this editor does not do quietly. A cut that would land on
the cells it is taking is refused rather than ordered. Rich text is refused. And
a cell that cannot take the paste refuses the whole rectangle, with the same
*the ones that can* answer `Delete` already offers.

### ADR-033 — The look on the clipboard reaches Sheets; Excel takes everything but the fill, and we stop there
**Accepted.** Measured, 2026-08-16, pasting a styled rectangle out of the
preview: **Google Sheets takes all of it** — the fill, the white bold heading,
the number formats. **Excel takes the values, the bold, the font colour and the
number formats, and passes over the fill**, which for a white-on-dark heading
leaves a cell that looks empty with its text still in it. Three forms were tried
in one pass and none of them moved it: `background-color`, the shorthand
`background` Excel's own exported HTML writes, and the `bgcolor` attribute its
importer is supposed to read. Hex rather than the CSSOM's `rgb()` was fixed
along the way and was not the cause on its own.

*The decision is to stop there*, and it is a judgement about what this project
is for: **yxl makes Excel files**. A reader who wants the workbook builds it —
that path carries every style the spec declares, through the compiler, and is
the one this editor exists to serve. Copying out to Excel is a convenience next
to it, and one that already carries the values, the bold and the formats.

*What this does not change:* ADR-028 stands as the shape of the thing — both
flavours, values in the text and the look in the table. What it promised about
*Excel receiving the look* is narrowed by measurement rather than by argument,
and §8 Q15 keeps the leads for anyone who wants to pick it up.

*What it costs:* a reader pasting a heading into Excel restyles it by hand.
Said plainly in the README rather than discovered.

### ADR-034 — A paste from outside carries values now and looks when the normalizer exists
**Accepted.** Pasting a rectangle in from Excel or Sheets writes what the cells
*hold* — read out of the `text/plain` flavour, each field meaning what it would
mean typed into that cell. What they *wear* is not written, and the `text/html`
flavour is not read at all yet.

*Why:* §7 has no fast path — every style write goes through the normalizer
(ADR-008), and the normalizer is Phase 9. Writing looks before it exists would
put an anonymous inline style on every one of two hundred pasted cells, which is
the exact outcome ADR-008 was written to prevent, and it would have to be undone
by hand afterwards.

*What this costs, and who pays:* a reader pasting a formatted report gets the
numbers and re-applies the look. That is the same trade the internal paste makes
(ADR-032), so the rule is one rule rather than two.

*What it is not:* a decision about §8 Q12. How much of the HTML flavour is
worth reading is still open, and is worth deciding when there is a normalizer to
hand what is read to.

### ADR-035 — The webview writes the clipboard and the host reads it
**Accepted.** Copying out is done in the view, inside the gesture, because two
flavours can only go on the clipboard that way (ADR-028). Pasting in is done in
the **host**, with `vscode.env.clipboard.readText()`, because the view is never
given a `paste` event to read one from.

*What was measured:* `Cmd`+`C` reaches the webview and `execCommand('copy')`
works from it — the copy-out lands in Excel and Sheets. `Cmd`+`V` reaches the
webview's `keydown` and then nothing happens: no `paste` event on the cell, and
none on a `<textarea>` focused inside the key handler either, which is the
pattern that works in a browser. Two attempts, both measured in the extension
host rather than in jsdom, where a synthetic event had made both look fine.

*Why the asymmetry is not a wart:* the two directions genuinely differ. Writing
needs the gesture and the flavours; reading needs neither — it needs a clipboard
the host can simply ask for. `vscode.env.clipboard` is the API for exactly that,
and it is the one place in this design where the extension host knows something
the page cannot.

*What it costs:* `readText()` is text only, so the `text/html` flavour is
unreachable from the host. That does not bite yet — ADR-034 has the paste
carrying values and not looks until the normalizer exists — and §8 Q12 now has a
second constraint to answer to: whatever reads the HTML has to run somewhere
that can see it.

*What it buys back:* the view stops holding a decision it had no business
holding. It says where the paste goes and what it has of its own; which of the
two pastes this is, is worked out where the clipboard actually is.

### ADR-036 — A cell of a filled range answers with the formula as it applies there
**Accepted.** `cellAt` shifts a `formulas:` range's formula by the asked-for
cell's offset before returning it (ADR-031's `units.moved`). `C5` of a range
anchored at `C2` holding `B2*0.05` answers `B5*0.05`, which is what the workbook
holds at `C5`. The range itself is untouched — `CompiledFill` still keeps one
formula for the whole rectangle, and ADR-019's sparseness is unchanged.

*Why:* every consumer was shifting it back for itself, and one of them forgot.
`evaluate` shifted before computing, `paste` shifted before writing a copy out,
`diff` had just grown a shift so a re-anchored range would not read as a change
— and the *view* did not, so the box a reader types into opened with the
anchor's formula. Adding `*1.1` to `C2*D2` in a cell three rows down produced
`C2*D2*1.1`, which the resolver could then not offer as the range's own formula
at all, since `C2` three rows further back is off the sheet. The reader was
offered one answer where the cell's own formula has two.

*What is deliberately not done:* an answer that does not apply is not offered,
and does not say why it is missing. What a reader can act on is the list of what
*can* be done; spelling out every way an edit could fail to have an answer is a
surface that grows with the table and is read by nobody.

*What it removes:* the compensation in `paste` and in `diff`, and three
workarounds in the view that existed only because the number was wrong — the
`↧ C2` a filled cell showed instead of a formula, the hover's *Excel shifts the
references per cell* hedge, and the empty string a filled cell copied out as.
A filled cell now shows, tells, copies and seeds its editor with its own
formula, which is also what Excel would show for it.

*What it costs:* one `moved` scan per `cellAt` on a filled address — a scan of a
formula's characters, no parse — and it happens where a cell is asked for rather
than where a range is stored. A formula `moved` refuses comes back as the range
wrote it, since a wrong-looking formula is better than a missing one.

*The oracle agrees:* Tier 4 builds a spec with the pinned `yxl`, extracts the
workbook back, and reads `C3` of a two-cell range as `B3*0.1` — the shared
formula shifting per cell, through the real compiler and the real extractor.

### ADR-037 — A look nothing declares is written where it is used, not declared
**Accepted**, superseding **ADR-008**'s third step. The normalizer's order is
now: (1) an exact match against a declaration → name it; (2) a declaration near
enough to be a variant → an inline `{ extends: base, …restated }`; (3) otherwise
the look itself, inline. A new `defs.styles` entry is *not* created for a look
worn once.

*The evidence:* `yxl extract` is the compiler's own writer of specs, and it was
run on a workbook built from `examples/styling.yxl.yaml` to see what it writes.
A look worn by two cells becomes a declaration, named on evidence — `header`
for bold on a fill, `number` for a lone `#,##0`; a look worn once is written
inline at the cell. It emits no `extends:` at all: inheritance is a thing a
person writes, and a base is a claim about kinship that nothing in a workbook
records. §1's convergence claim is that a spec written by clicking looks like
one written by hand, and this is the closest thing to a measurement of that.

*What ADR-008 got right and this keeps:* every style write goes through the
normalizer, exact matches are reused, and the tenth identical fill does not
become the tenth anonymous look — because the first one, once declared by any
means, is what the ninth and tenth find in step 1.

*What it leaves open:* repetition among looks written inline. Ten *distinct*
one-off looks are ten inline mappings and should be; ten *identical* ones are a
spec that wants a declaration, and folding them into one is Phase 13's first
refactor proposal — reviewable, `expectedDiff: empty`, and it rewrites the sites
the reader did not touch, which is exactly why it is a proposal rather than a
consequence of typing.

*The two rules a variant has to pass*, both in `normalize` and both tested: it
may restate at most `NEARBY` properties, and it must inherit at least as many as
it restates. The second is what stops `{ extends: a_style_sharing_one_thing, … }`
— a line of kinship that buys nothing and misleads. The first is what keeps a
variant a variant. A declaration that sets a property the look does not is never
extended: the schema has no way to take a property back, so it would arrive on
the cell.

### ADR-038 — A look is taken off by leaving the leaf out, so `null` is the ask
**Accepted.** A gesture that takes a look off — "no fill", "automatic text
colour" — is `null` for that property in a `StyleWant`, the write-path twin of
`StyleValues`. The schema has no way to say "no fill" (ADR-037's last paragraph
is the same observation from the other end): absence is the only way it is said,
so the ask is *drop the leaf*, and the edit is a `remove` rather than a `set`.

*What follows, and is the point of writing this down:* a property supplied from
*under* the cell cannot be taken off **at** the cell. Where a band or a
declaration gives the fill, no bytes written on the cell take it away, so the
cells answer is not offered at all and the only answers are at the layer that
supplies it — change the declaration, change the band — each with its ripple
count. That is the resolution table working, not a gap in it.

*A boolean is the exception, and stays one.* A switch turned off sends `false`,
not `null`: `{ extends: header, font: { bold: false } }` is a thing the schema
can say and the honest form of "a header, but not bold". `null` is available for
a boolean too and means the stronger "stop saying anything about it", which no
control sends today.

*The gesture a reader expects here is one the schema cannot answer*, and that
is **[yxl#71](https://github.com/t-ujiie-g/yxl/issues/71)** rather than something
to build around. Click *no fill* on a cell under a filled column band and the
only answer is to change the band — the whole column, from a gesture on one
cell. An editor-side consolation (asking first, refusing, offering a white fill)
would be work thrown away the day `fill: null` exists, so the request went
upstream and the behaviour here stands as it is until it is answered (§8 Q16).

*Taking the last leaf out takes its mapping with it*, up to but never past the
construct's own node. `- { at: A, style: { fill: X } }` goes back to
`- { at: A }` rather than to `- { at: A, style: {} }`, so a look put on and
taken off leaves the file byte for byte where it started. The declaration itself
is never removed — cells name it — so a `defs.styles` entry emptied this way is
left as `{}`.

### ADR-039 — The spec can say an attribute is not set, so the cell answers
**Accepted**, superseding **ADR-038**'s second half. yxl 0.3.5 gives `null` a
meaning at every style attribute, at a whole group (`font: null`), and at the
`format:` shorthand (`docs/spec.md` §6, yxl#71). What ADR-038 got right stands:
`null` is the ask, and a boolean still says it with `false`. What it said could
not be done now can.

*The model carries it as the set an attribute is in, not as a third value in
every field.* `Style.cleared` is a `ReadonlySet<StyleProperty>` beside the
fields, mirroring the compiler's own bitmask, and `flatten` lays the clears down
first so a value written beside one wins — which is the schema's rule, and is
why `{ border: { all: thin, left: null } }` has four edges.

*Two types, and the difference between them is the whole point.* `StyleSays` is
what one construct says — a value, or `null` where it says the attribute is not
set — and it is what a layer gives, what `resolve` returns, and what a reader
asks for. `StyleValues` is what a cell finally looks like, where "not set" and
"explicitly not set" are one cell; `settled` is the crossing between them, and
everything that *draws* takes the settled form. The compiler makes the same
distinction at the emitter for the same reason: two cells that look identical
must intern as one.

*A border is taken away at the edge*, not at its `style` and `colour`
separately, because that is the unit the schema has. Our leaves are finer, so a
cleared edge is both of them, and the writer folds them back into
`border: { left: null }` — the only spelling that loads.

### ADR-040 — A frozen pane is drawn beside the window, and the grid stopped collapsing its borders
**Accepted.** `freeze:` names the first cell that scrolls (`docs/spec.md` §2),
so honouring it is two decisions: what the host sends, and how the view holds it
still.

*The frozen band is not part of the window.* The view is sent a window of the
sheet (ADR-019), and a reader at row 800 has a window that starts at row 780 —
the frozen rows are not in it, and a pane that disappears exactly when the sheet
gets long is not a pane. So the host sends the frozen rows and columns **beside**
the window, as an extra band of addresses, and the view draws them in flow at
the top and the left with the gap under them shortened by their height. The cost
is bounded by refusing to draw a pane deeper than half a window: freezing 100
rows fills any viewport, and past that the sheet is drawn scrolling with no
pane at all rather than half a promise.

*Held still with `position: sticky`, which needed the grid's borders separated.*
Under `border-collapse: collapse` the line between two cells belongs to the
*table*, and so does each cell's background — Blink paints both in the table's
own phase, under every positioned cell. A sticky cell therefore cannot cover
what scrolls beneath it: the text of the scrolling cells shows straight through
the frozen band. The grid is `border-collapse: separate` with each cell carrying
its own right and bottom line, which draws the same 1px grey and lets a frozen
cell paint over what passes under it. Measured under headless Chrome before
shipping, as the drag grips were.

*Setting one is not a resolution-table row.* A freeze has exactly one place to
live — the sheet's own key — so there is nothing to enumerate: the gesture is an
`Intent`, not a list of `Candidate`s, and it applies without asking. It moves no
cell, so it claims none, and the checker's diff (which compares cells) never sees
it — the same blind spot `width:` and `height:` already have, and the reason
`expectedDiff: empty` is a claim about *cells* rather than about the file.

*Two things the editor will not write.* `freeze: A1` freezes nothing and is an
error upstream, so the button is disabled there and the intent refuses it — the
loader still reads such a spec, because reading is not endorsing (ADR-011), and
the fixture in `tests/fixtures/deferred` says so. A sheet already carrying a
`split:` is refused rather than rewritten: the schema forbids both, `split` is
not modeled here, and taking out a construct we do not draw is not a choice a
reader can weigh in a preview.

### ADR-041 — The view says *how* a selection was taken, and a look over a whole column is a band
**Accepted.** Clicking a column heading selects every cell of that column. What
follows from it is not the selection but the *write*: bold over `B1:B400` is
four hundred `cells:` entries under §4.4's `setStyle`, and one `columns:` band
under Excel's own reading of the same gesture. The second is what a spec would
have been written with, so it is what the editor writes.

*The rectangle cannot say which it was.* A sheet has no last row in the spec —
the grid draws a window and some room past it (ADR-019) — so `B1:B400` and "the
whole of B" are the same rectangle, and inferring one from the other would be
the guess ADR-001 forbids. The **gesture** knows, so the gesture carries it: the
view holds how the selection was taken beside the selection itself, and sends it
with the look. One more field, `whole: 'columns' | 'rows' | null`, and no
inference anywhere.

*Over a span the per-cell answers are not offered at all.* This is the one place
the resolution table drops an answer rather than ranking it: writing a look on
four hundred cells is not a thing a reader chooses between, it is a thing that
happens to them. §4.4 already makes the argument for a *width* — "a size is a
band, never forty cells" — and the argument is about the gesture, not about the
property. What is still offered beside the band is whatever already supplies the
look, because changing that reaches beyond the column and the reader should say
so first.

*The band is written through the normalizer* like every other style write
(ADR-008, ADR-037): a declaration that already says it, a variant extending the
nearest one, or the look itself, in that order. `style: strong` where `strong`
exists, `style: { font: { bold: true } }` where it does not.

*What it claims is what it moves.* A new band over `B` changes how every cell in
B looks, so `expects.cells` is the cells the sheet **holds** there — not the
four hundred addresses the rectangle covered, most of which nothing writes. The
count the reader is shown is that number too.

### ADR-042 — A band over exactly what was dragged is that band, and a run is dragged as one
**Accepted**, superseding the last paragraph of §4.4's `setSize` table.

*A run of headings drags as one.* Select columns B to D and drag any of their
edges and all three take that width, as they do in Excel. The view knows the run
— it is the selection it already holds — so the gesture carries `first` and
`last` where it carried one `at`, and one column dragged outside the selection
is the run `D–D`. Nothing infers a span from a rectangle (ADR-041 makes the same
argument for a look).

*The band that is already there takes the size.* §4.4 used to say that a band
setting no size does not size the column, so dragging it writes a *second* band
beside the first — "the two bands then say different things about the same
column, which is what layering is for". That was true about layering and wrong
about this: `- at: D, style: header` and `- at: D, width: 20` are one band
written twice, and a reader who wanted two entries would not have written the
same `at` on both. Layering is for spans that **differ**. So a band whose span is
exactly the run takes the size, and gains a `width:` where it had none. This is
the rule #92 arrived at for looks, applied where it came from.

*Several bands, each reaching past the run, get one band over the run.* Splitting
three overlapping bands to make room is a bigger rewrite than the gesture asked
for, and the layered answer is one line: a band over exactly the run, written
last, wins for the columns inside it and says nothing about the ones outside.
Where a **single** band reaches past the run, the two answers §4.4 already had
still stand — change it, or split it so the run stands alone — and the split now
takes the whole run out in one piece rather than one column.

### ADR-043 — The host sends the run, the view measures it
**Accepted**, answering §8 Q17.

*Fitting a column to its contents needs two things this editor keeps apart.*
Every cell of the column is on the **host** — the view is drawn a window of the
sheet and nothing more (ADR-019) — and the font each cell wears, with something
to measure text in, is in the **view**. So the gesture is a round trip: the view
asks to fit, the host answers with that run drawn as cells, and the view measures
and sends back an ordinary drag.

*A count of characters is not a width*, which is what ruled out letting the host
measure. `東京第一倉庫` is six characters and 88px in the grid's own face;
`Revenue` is seven characters and 57.7px. Any answer that counted, or that
multiplied an average character by a length, would have been wrong for every
spec with CJK text in it — which is the specs this editor is being written for.
Giving the host a table of per-font character widths is the same answer with
more machinery, and a second implementation of what the browser already has.

*Measuring only what is drawn was the other way*, and it is worse than it looks:
the width would depend on where the reader had scrolled to, so the same
double-click would give two answers on the same file. A gesture whose result
moves with the scrollbar is not one a reader can trust.

*What comes back is a drag.* The measured width goes through `setSize` like any
other, so the answers are §4.4's — the band over the run, or the question a
shared band asks — and a fit is undone by the same undo. Nothing new can reach
the file this way.

*The view answers with nothing where it cannot measure.* A shell with no canvas
sends no width rather than a wrong one, and the column is left as it was.

### ADR-044 — The outline is drawn on the heading, not in a gutter of its own
**Superseded by ADR-045.**

*Excel and Sheets both put the outline in a gutter*, outside the headings: a
strip above the column letters, another left of the row numbers. Ours is a bar
along the **outer edge of the heading itself**, one level in from the last, with
the `−` at the end of the run.

*The reason is the origin.* A gutter is a column added to the left of every row
and a row added above every heading, which moves the grid's top-left — and the
top-left is what everything else here is measured from: the table's declared
width, the pad that stands for the columns the window left out, and the `left`
each frozen column is pinned at (ADR-040). Adding a gutter means threading a
second origin through all of it, for a strip four pixels wide. The bar says the
same thing in the place the reader is already looking, and the geometry keeps
its one origin.

*A collapsed group's control cannot sit on its own run*, because that run is
hidden and nothing of it is drawn. It goes where the plain hidden mark would go
— on the heading the run sits behind — and the plain mark stands aside for it,
so a reader sees one control rather than two marks about the same thing.

*Collapsing is a write, not a view state.* `group` with `hidden: true` is what
`docs/spec.md` §4 calls a collapsed group, and there is nowhere else to keep it:
ADR-015 leaves the editor no sidecar and ADR-001 leaves the grid no state of its
own. So the `−` writes `hidden: true` through the same band rows the hide
gesture uses, and the `+` takes it out again.

### ADR-045 — The outline gets the gutter after all, and the origin moves with it
**Accepted**, superseding **ADR-044** the day it was written.

*ADR-044 weighed a four-pixel strip against threading a second origin through
the geometry, and chose the strip.* Shown the result, the reader asked for the
gutter — which is the right call and the one this project's own rule points at:
a spreadsheet's reader knows where the outline lives, and "it was cheaper" is
not a reason they should have to hear. ADR-044's *reasoning* stands and is worth
keeping visible: the cost was real, and it is now paid.

*What it cost.* One gutter row per column level above the headings, one gutter
column per row level left of the row numbers, and everything measured from the
grid's top-left moved by them: the table's declared width, the `left` a frozen
column is pinned at, the `top` a frozen row is pinned at, the row numbers' own
sticky `left`, the corner's, and the span a gap row covers. Each is now written
as `gutterOf(sheet, axis) + …` rather than as a constant, which is the honest
shape — the origin *is* a function of the sheet.

*The gutter cells are part of the frozen band.* They stick with the row numbers,
because an outline that scrolled away from the rows it brackets would be worse
than none.

*A collapsed run's control stays in the gutter too.* Its own gutter cells are
not drawn — the run is hidden — so the `+` goes in the gutter cell of the next
one along, pulled back onto the seam its run is hidden at. ADR-044 had put it on
the heading, which is where the plain hidden mark goes; a control inside a
heading reads as part of the heading, and the reader said so. The plain mark
stands aside for it either way, so one run never wears two marks.

*The controls are big enough to hit.* Nine pixels was what the heading had room
for; a gutter has as much room as it takes, so a level is 18px and the control
13px — which is what makes a `+` legible beside a column letter.

### ADR-046 — The view draws its own tooltips, and the extension keeps the keys
**Accepted** 2026-08-23.

*A webview never shows the browser's `title` tooltip.* Reported from the running
preview, on an enabled button, with a cell selected: nothing appears. So every
control in the toolbar carries its name in `data-says` and an `aria-label`, and
the stylesheet draws the bubble — dark, under the button, after the pause a
tooltip waits. This is also the only way a *disabled* control can be named,
which is exactly when a reader most wants to know what it is.

*It is the toolbar's, not the grid's.* Inside the scroller a bubble would be
clipped by the pane it is drawn in and would fight the sticky ladder that holds
the frozen band. The marks in the grid — a hidden run, an outline control — keep
`title` and their position says most of it.

*A webview forwards its keys to VS Code, which answers some of them.* `Cmd`+`B`
closed the side bar behind the preview even though the view had taken the event:
the forwarding happens whatever the view does with it. The extension binds the
three to a command that does nothing, `when` the preview is the active panel, so
VS Code's own keybinding does not match and the view's answer is the only one.
The gesture stays in the view, which is the side of the seam that knows what a
key is.

### ADR-047 — A listener built at draw time does not decide about the selection
**Accepted** 2026-08-23.

*The grid is drawn once and restated many times.* `restate` moves the selection
without rebuilding a single cell, which is what makes arrow keys and dragging
cheap (ADR-001). Every listener on a cell or a heading therefore closes over the
`Showing` as it was **when the grid was last drawn**, and the reader has moved
since.

*So a listener reports the gesture and nothing more.* The right button asks for a
menu at a place; whether that place is inside the selection — and so whether the
selection stands or the run under the pointer is taken — is decided in the view,
where the selection actually lives. The predicates are the same ones the drawing
uses (`reaches`, `headed`), applied to the state of the moment.

*Why it is worth an ADR.* The bug it fixes looked like three different bugs, and
was reported twice: a run of columns lost on right-click, then a rectangle lost,
then a `Shift`+arrow reach lost — each of them the same stale closure, each
"fixed" by a guard that read the same stale value. The rule is what stops the
fourth: **a listener may say what happened and where; it may not say what is
selected.** Anything a listener needs to know about the selection is an argument
the view passes in, or a question the view answers.

### ADR-048 — A refusal carries the message it was about
**Accepted** 2026-08-23.

*A question and its answer were two message kinds.* `wear` and `worn`, `hide`
and `hidden`, `group` and `grouped`, `resize` and `resized`, `empty` and
`emptied`, `edit` and `resolve`, and two more for paste: sixteen kinds where
eight would do, and each pair carried the same payload to the same handler. The
second of each existed only to say *and here is the answer the reader took*.

*A message now carries its own answer.* `choice` is an optional field on the
message a reader can be asked about, and a refusal carries **the message the
host was handling** rather than a re-labelled copy of its payload. Taking an
answer is `{ ...about, choice }` — one line, for every gesture there is and
every one there will be.

*What it removed.* Eight message kinds, eight `Asks` methods, the eight-armed
`About` union and the eight-line `if` chain that turned one into the other,
and eight rows of the host's dispatch table. What is left is one path: a
listener reports, the host refuses with the message, the view sends it back.

*The rule that comes with it: `kind` is written last.* A message carries its
own, so an `about` built as `{ kind: 'edit', ...typed }` takes whatever kind the
message arrived under. Spread first, name the kind last — that is also how an
override goes out as an override rather than as the edit it excepts.

*The same shape on the host.* Four gestures — a look, a size, hiding, grouping —
were the same forty lines four times: parse the sheet name, ask §4.4 for the
answers, refuse where there are none, apply the sole answer or ask, apply the
answer taken, say what happened. That is now one function (`asked.ts`) and four
vocabularies of five sentences each. Phase 11's insert and delete are a
vocabulary, not another copy.

### ADR-049 — A link opens the web and the post, and nothing else
**Accepted** 2026-08-24.

*A spec is a file, and a file may come from anywhere.* Following a `links:`
entry hands its target to `vscode.env.openExternal`, which gives it to the
machine's own handler for that scheme. A spec pulled from a repository, a
gist, or an attachment could therefore carry `file:///…`, or a scheme some
installed application registered, and this preview would be the thing that
opened it — on a gesture that looks like clicking a link in a spreadsheet.

*Only `http`, `https` and `mailto` are opened.* Anything else is refused with a
sentence naming the three, so a reader who meant it can still open the target
themselves. Which scheme a target has is decided in `links.ts`, beside where the
link is resolved, and not at the call to `openExternal` — the decision is a
value the tests can hold.

*A `to:` is not a URL at all* and does not go through this: it is a cell on a
sheet of this workbook, or a refusal.

*What this costs.* A spec that links to a file beside it — a plausible thing to
want — is not followed here. That is the trade taken: the reader is told what
this preview opens, and nothing on their machine runs because a spec asked.

### ADR-050 — A cell of runs is retyped a run at a time, and not as a whole
**Accepted** 2026-08-29.

*A cell cannot be `rich` and hold a value too.* `docs/spec.md` §3 gives a cell
one thing to hold, and both loaders refuse a `rich:` beside a `value:`. So the
question a rich cell asks of the grid is not *where does the value go* but
*which of the runs did the reader mean* — and the grid, whose gesture is one box
over one cell, has no way to say.

*The alternative was to let typing replace the runs.* One box, the whole cell,
the `rich:` key dropped and a `value:` written in its place: the gesture would
be the ordinary one, and the reader would lose the fonts a colleague wrote —
silently, on a keystroke, in a spec they may only be visiting. That is a
guess about what somebody meant, which is the one thing this editor does not do
(ADR-001).

*So the bar picks the run.* The runs are named in a picker and the box holds one
of them; the grid refuses a whole-cell edit and says where the runs are edited
instead. `Editable` gained a fourth answer, `rich`, so the hover, the inspector
and the refusal say the same thing before anyone types.

*What it costs.* Making a rich cell into a plain one is not a gesture — the
reader edits the YAML, or writes an override. Adding a run, removing one, and
changing a run's font are not gestures either. They are all structure rather
than text, and each would want its own answer to *which run, and where*; none is
promised by Phase 15's line, which is about the text.

### ADR-051 — What the core says is a code and its parts, worded at the edge
**Accepted** 2026-08-29. Answers §8 Q18.

*The problem is where the words are.* A refusal and a diagnostic were English
prose built at the place the thing went wrong — a template literal in `loader`,
a sentence in `intent` — which is the one place a second language cannot reach.
Some three hundred of them.

*So a message is data, and the sentence is written where it is read.* The core
says `{ id, args }`: which sentence, and the values that go in it. An edge holds
the sentences — one function per id per language — and words the message in the
reader's own language when it draws it. `code` is untouched: it stays the stable,
greppable class of the thing that went wrong, and one code may have several
sentences (`cst.not-a-mapping` says two different things about two different
paths).

*The sentences live beside the ids that name them*, in the package that says
them (`packages/cst/src/text.ts`), not in one file at the bottom of the tree.
The ids are typed — a `Says` type maps each id to what fills it — so a language
that is missing a sentence, an id nobody declared, and an argument a sentence
does not take are all compile errors rather than a blank in front of a reader.
`diag` owns only the mechanism.

*Each side words what it draws.* The view words the panel: the cell marks, the
refusals, its own chrome, reading the language off `<html lang>`, which the host
sets from `vscode.env.language`. The host words what VS Code shows for it — the
Problems panel — reading the same setting. Nothing is worded before it is sent,
so the protocol carries the message, and the backticks a spec's own words are
written in are dropped where the text is drawn rather than before it crosses.

*The alternative was to carry both languages where the sentence is written.* It
is a smaller change, and it freezes the wording: a project whose messages are
half of what it is would be rewriting two strings every time it reworded one,
and a translator would be editing source.

*The pass is staged rather than a flag day.* `Diagnostic.message` and a
refusal's `why` are `Saying = string | Message` while packages convert one at a
time; the `string` half goes when the last site does. `tests/languages.test.ts`
holds the two languages to the same list, and to different sentences — a
Japanese line copied from the English one is a failure, not a silence.

*What stays English*: the schema's key names, `docs/spec.md` references, and
`yxl`'s own output, which is the compiler's to translate (ADR-011).

## 8. Open questions

- **Q1 — `cells:` A1 keys and row insertion.** ✅ *Answered 2026-08-23.*
  **No**: anchor-relative addressing in `cells:` is not worth proposing
  upstream. A `cells:` mapping is keyed by address because that is what makes it
  readable on its own — `A1: Region` says where it is without counting from
  anything — and an anchor would take that away from every scattered cell to
  spare the diff of the rare inserted row. The format already has the answer for
  the case that hurts, which is a *table*: `data:` with inline `values:`, where
  inserting a row is one line. So the structural phase **steers** — it rewrites
  the keys where it must, and offers the conversion where the rewrite is what is
  bloating the diff. A paste of two hundred rows is the same judgement and gets
  the same answer.

  *What that costs, and why it is affordable:* the rewrite is mechanical
  (`rekeyMap`), the reference arithmetic is `shifted` (`units`), and the diff it
  would make is shown before it is made — so the reader chooses a total diff
  knowingly, or takes the conversion instead.
- **Q2 — How much formula translation do we do?** ✅ *Answered 2026-08-16
  (ADR-031).* As much as Excel does to a shared formula, and no more: relative
  references move, `$`-anchored halves stay, and strings, names and table
  references are returned byte for byte. It is `units.moved`, a scanner rather
  than a parser — a formula's *meaning* is never needed, only which of its words
  are references — and a formula it cannot move with certainty is refused with
  the word that stopped it. This unblocks the rest of the `formulaRange` row (①
  away from the anchor, and ② splitting the range) and is what a paste of a
  formula cell uses.
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

  *The packaging half is Phase 20*, opened 2026-08-29: what is left of it is a
  publisher, an icon, the package's own README, and a `.vsix` that installs on a
  machine that has never seen this repository.
- **Q7 — The JSON Schema.** ✅ **Answered: it exists**, upstream, at
  `docs/yxl.schema.json` — *generated* from `docs/spec.md` by
  `tools/spec-schema/generate.py`, which is the part that keeps it honest: the
  reference is edited and the schema follows.
  *What it is for:* hand-editing. Point an editor's YAML support at it
  (`yaml.schemas`, mapping the URL to `*.yxl.yaml`) and a spec gets completion
  and structural validation in the text beside the preview. No code here reads
  it.
  *What it is not:* a validator of record. ADR-011 stands — a schema can say
  `cells:` takes a mapping; it cannot say that the style a cell names is
  declared, that an override lands on a cell something writes, or that a table's
  range matches its rows. `yxl build --check` remains the answer to *is this
  spec valid*, and our loader still validates only what projection requires.
  *Not shared from this repo* (decided 2026-08-16): the mapping is one line in
  somebody's own `settings.json`, and committing it would put a URL in every
  contributor's editor plus a soft dependency on whichever extension provides
  YAML support — in a project that has no other. Whether the *extension* should
  contribute the mapping itself, so a reader gets it without configuring
  anything, is a question for the release phase and is asked there.
- **Q8 — Tauri.** ✅ *Closed 2026-08-23, not pursued.* A shell other than VS
  Code is out of scope (§1). Nothing in the architecture blocks one (ADR-004),
  and nothing in the plan will make room for one.
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
- **Q11 — What shape does a paste land in?** ✅ *Answered 2026-08-16.* Inside the
  grid, `cells:` entries — §4.4's `empty` row scaled up (ADR-032). From outside,
  **the reader is asked**, once, with the lines each answer would add: one
  `data:` block, or `cells:` entries. That is ADR-028's own process, and what
  makes it answerable rather than a guess is that the two numbers are on the
  buttons — 4 lines against 600. The `data:` block is offered only where nothing
  writes those cells yet, since two writers for one address is not a shape
  question but a mistake.
- **Q12 — How much of the clipboard's HTML do we read?** Excel and Sheets both
  write `text/html`, and neither documents it. Number formats arrive as already
  formatted text, colours as inline styles that differ by version. The open
  question is where to stop: values and a handful of look properties, or
  everything we can recognise. Answer by measuring against real clipboards from
  both applications, not by reading a blog post.
- **Q15 — Why does Excel's clipboard reader pass over a `<td>` fill?** Bold,
  font colour, number format and the values all arrive; the fill does not, in
  any of the three forms a reader would expect (ADR-033). Deprioritised, not
  closed. The leads worth trying next, in order of what Excel's own clipboard
  HTML actually contains: a `<style>` block with generated classes and
  `class=` on each cell rather than inline declarations; the `mso-` properties
  beside them; and the full `<html xmlns:x="urn:schemas-microsoft-com:office:excel">`
  wrapper Excel writes around its own fragment. Whoever picks it up should
  paste *out of* Excel first and read what it puts on the clipboard, rather
  than guessing at the reader from the outside — which is what this pass did,
  and why it got one of three things right.

- **Q16 — Can a spec say a property is *not* set?** ✅ *Answered 2026-08-20 by
  [yxl#71](https://github.com/t-ujiie-g/yxl/issues/71), which shipped in yxl
  0.3.5 as `null` at every attribute* (`docs/spec.md` §6). Asked because a
  boolean can be contradicted and nothing else could, so a cell under a filled
  band had no way to say it is unfilled. Answering it took one round trip
  through `extract` to show it was a defect rather than a GUI wish. **ADR-039**
  is what this editor does with it; the cell is now one of the answers.
- **Q13 — What draws a chart's sketch?** ✅ *Answered 2026-08-26.* **Hand-written
  DOM and inline SVG, and no dependency.** The spike over `charts.yxl.yaml` and
  `sparklines.yxl.yaml` came back saying the sketch wants a box, a title, a
  legend, and one mark per chart family — which is a CSS grid and a dozen SVG
  primitives. The axes it *does* want turned out to be their titles, not scales:
  a scale drawn from the data would be the rendering ADR-029 refuses. A chart
  library would have to be told not to draw the chart. Sparklines are the one
  place a real plot is drawn, and it is a polyline over the values the sheet
  already holds — the same values a `data_bar` is drawn from.
- **Q14 — What does one question about a rectangle look like?** ✅ *Answered
  2026-08-19.* *The origins grouped, a count against each* came first: a
  rectangle that cannot be written says `2 are filled by a range, 1 reads a
  definition`, and a single cell still says its own reason, which no count
  improves on. The size of the diff is measured and said before the edit lands.
  The other half is **one answer per group**, and what it took was noticing that
  *excluding* a group cannot be the shape: with two groups in the way, dropping
  one leaves the other still refusing, and with one group it is the answer that
  was already there. So a group answer **resolves** its group — the exception
  that origin allows — and leaves the others out. The answer carries the group
  it names rather than the whole rectangle, which is the machinery the question
  was really about.

- **Q17 — What does *fit the column to its contents* measure?** ✅ *Answered
  2026-08-22 by **ADR-043**.* The **host sends the run and the view measures
  it**: the host has every cell of the column, the view has the font each is
  drawn in and a canvas to measure with, and neither half is worth
  reimplementing on the other side. What settled it is that a count of
  characters is not a width — `東京第一倉庫` is six characters and 88px, and
  `Revenue` is seven and 57.7px, both in the grid's own face — so any answer
  that let the host measure was going to be wrong for half the specs this is
  for. Measuring only what is drawn was the other rejected answer: a width that
  depends on where the reader had scrolled to is the wrong kind of surprise.
- **Q18 — How deep does the second language go?** ✅ *Answered 2026-08-29 by
  ADR-051: a code and its parts, worded at the edge.* The reasoning, kept
  because the cost was the argument against it: The chrome is easy and the manifest is VS Code's own problem.
  The question is the **refusals and the diagnostics**, of which there are some
  three hundred, each written as prose at the place the thing goes wrong. Either
  they become a **code and its parts**, rendered where the reader is — which is
  the right shape, is what the `code` field was always for, and is a pass over
  every message site — or the sentence carries both languages where it is
  written, which is cheap and freezes the wording of a project whose messages
  are half of what it is. The first item of Phase 19 is to answer this in an
  ADR, before any of it is translated.
- **Q19 — What is a column width, exactly, in Excel's arithmetic?** *(Phase 17,
  opened 2026-08-29 by a reader who fitted a column here and opened the workbook
  there.)* Excel's unit is the width of `0` in the workbook's default font, and
  its own pixel formula adds five to the product — neither of which this editor
  does: it divides by a flat seven, having added ten of its own padding first.
  That half is arithmetic and has an answer. The other half is that the reader's
  machine may not **have** Calibri — macOS usually does not — so the canvas
  measures a substitute, and no arithmetic fixes that. What is left to decide is
  whether to carry a metrics table for the handful of fonts a default is ever
  set to, or to say plainly that a fitted width is this editor's best guess at
  Excel's.
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
  *Sharpened 2026-08-16 by a reader asking whether every edit would now cost a
  click:* the rule that answers it is `Candidate.alone` — an answer that is the
  whole answer is taken, not offered — and the ask rate is now a number the
  gesture table (§6) can be read against. A gesture that asks where a reader
  can see only one possible outcome is a bug, not a policy.
- **R8 — A paste is the largest edit anyone will make.** Six hundred cells
  through the loader, the compiler, the verification loop and the patcher, twice
  (before and after), while somebody waits. The Phase 4 measurements say the
  core is fast enough (R5) and say nothing about a write that size. Measure at
  the start of Phase 8, on a real paste out of Excel, before the UI is built
  around an assumption.
- **R9 — "It replaces Excel" is a sentence people will hear as a promise.** The
  gesture table in §6 exists so the answer is a list rather than an adjective,
  and the README says the same list. The failure mode is not over-promising in
  the README; it is a demo where four gestures work and the fifth does nothing.
  Which is why §3's eleventh principle is *refused in a sentence, never
  ignored*.
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

### 2026-08-29 — Every refusal, in the reader's own language

Phase 19's long tail, minus the diagnostics: everything this editor says when it
will not do what was asked, and every answer it offers instead.

- **`intent`'s 122 refusals**, and the host's own 40 — the sentences under
  *Leave it as it is*, the answers in the question above them, and the line the
  panel says after a gesture worked.
- **An argument may be data now, and a sentence may quote a sentence.** A
  rectangle's refusal counts what stood in the way *by kind* — `2 cells are
  filled by a range, 1 reads a parameter` — and Japanese counts with a unit
  after the noun. Neither language can be assembled from the other's fragments,
  so `Args` carries any JSON value and a sentence is handed a `worded` for an
  argument that is a message. ADR-051 is amended with both.
- **A message is worded by the side that owns its book.** The view cannot import
  the host's book, so the host words a refusal, its answers and its `said:` line
  before sending, and the view words what it draws from a drawing. That put the
  backtick stripping back where it was, at one place on the host.
- **Two prose sniffs went**, which is what a pass like this is for: the line
  offer read its own English (`what.includes('`cells:` keys')`) to decide
  whether to add a hint — it carries the count now — and two `done` messages
  lower-cased a candidate's first letter to embed it. That is grammar, and it
  belongs in the sentence.
- **The language test earned its keep twice more**: `${said} (${chord})` and
  `${name}: ${values}` are composition rather than prose, and the group's
  argument shapes made the old stub break. It compares the two sentences' source
  now, which is what a copied line actually looks like.
- **What is still English**: `loader` and `compile`'s diagnostics, and `units`'
  formula prose, which a refusal quotes verbatim through the `string` half of
  `Saying`.
- 2427 → 2430 tests. Comment shape: export 887 blocks / 1965 lines / avg 2.2,
  private 579 / 579 / avg 1.0, inline 135 / 215 / avg 1.6; 0 over the limit.

### 2026-08-29 — The panel in the reader's own language

Phase 19's third line: everything the panel says for itself.

- **140 sentences**, in the panel's own book beside the ids that name them, and
  a `chrome()` that words one where it is drawn. The toolbar's tooltips, the
  right-click menus on cells, headings and tabs, the formula and find bars, the
  inspector's headings and its *this cell cannot be typed into*, the tab bar,
  and what a chart says on hover.
- **Grammar is a sentence's own business**, which is why a sentence is a
  function. English counts a run of bands (*Hide these 3 columns*, *Hide this
  row*) and puts the side after the noun (*Insert 2 columns left*); Japanese
  counts with a unit and puts the side before the verb (`3 列を非表示`,
  `2 列を左に挿入`). Neither language is assembled from the other's pieces.
- **`spanSaid` stayed where it was.** The view says a run of rows or columns
  itself now (`spanned`), because a message cannot nest a message: an argument
  is a value, not prose in a language nobody has picked yet. The host's uses of
  it are refusals, and go with the refusals.
- **What is not translated, deliberately**: the key names of the schema, a
  format code, a font name, `Sheet!A1`, and the type of a chart — all of them
  the spec's own words (ADR-011). A validation list's *example* is translated,
  since it is a hint rather than a value.
- **Two sentences were not sentences**: `${said} (${chord})` and
  `${name}: ${values}` read the same in both languages, which
  `tests/languages.test.ts` calls a copied line. They are composition, not
  prose, and are back in the code that composes them.
- 2423 → 2427 tests. Comment shape: export 878 blocks / 1952 lines / avg 2.2,
  private 572 / 572 / avg 1.0, inline 135 / 215 / avg 1.6; 0 over the limit.

### 2026-08-29 — A message is a code and its parts

Phase 19's first three lines, and the decision the rest of it waits on
(**ADR-051**, answering §8 Q18).

- **The words move to the edge.** A refusal and a diagnostic were English prose
  built where the thing went wrong, which is the one place a second language
  cannot reach. The core now says `{ id, args }` — which sentence, and what goes
  in it — and the side that draws it words it in the reader's language.
- **The ids are typed.** Each package declares a `Says` type mapping every id to
  what fills its sentence, and keeps a book per language beside it. A language
  missing a sentence, an id nobody declared, and an argument a sentence does not
  take are compile errors, not a blank in front of a reader.
- **`code` did not change.** It is still the stable, greppable class of what went
  wrong, and one code may have several sentences — `cst.not-a-mapping` says two
  different things about two different paths, and now says each of them once.
- **`cst` and `patch` are converted**, which is what proves the mechanism rather
  than describing it: 24 message sites, 29 sentences, both languages.
  `Saying = string | Message` carries every site that has not been converted yet,
  and goes when the last one is.
- **The manifest is VS Code's own mechanism**: `package.nls.json` and
  `package.nls.ja.json`, with the manifest test holding them to the same list of
  keys and to answering every `%key%` the manifest asks.
- **The language is VS Code's.** The host sets `<html lang>` from
  `vscode.env.language` and words the Problems panel from the same setting; the
  view reads the page's own tag. No setting of ours, as the phase says.
- **Two languages, held apart by a test.** `tests/languages.test.ts` fails when a
  book's two languages hold different ids, when an id is not named for the
  package that says it, and when a Japanese sentence reads exactly as the
  English one — which is what a line copied and not translated looks like.
- **And the panel says anything at all again.** The pass before this one folded
  sixteen `postMessage` calls into one `send`, and folded `send` itself: its
  body was a call to itself, so the first message a panel sent overflowed the
  stack and the grid drew nothing. Nothing caught it — the panel's own wiring
  has no tests — so `tests/calls.test.ts` now reads every source for a body
  whose first statement calls the name it belongs to, which is what that class
  of rewrite leaves behind. It fails on the old code.
- 2406 → 2423 tests. Comment shape: export 874 blocks / 1948 lines / avg 2.2,
  private 570 / 570 / avg 1.0, inline 135 / 215 / avg 1.6; 0 over the limit.

### 2026-08-29 — One way to say what a cell copies as

A pass over the whole tree with §8's lenses, in order. What it found and what it
did with it:

- **Two implementations of the same tab-separated text.** The view built it for
  the clipboard and the host built it again for a copy that reaches past the
  drawn window (ADR-035), and the two had already drifted: the host wrote
  nothing at all for a rich cell, where the view wrote its runs. That is a
  divergence a reader meets as "the copy is empty when the selection is large",
  which is the worst kind — it depends on how far the sheet is scrolled. There
  is one `fields.ts` in `webview` now, and both halves call it; the host's
  `copying.ts` is three lines around a drawing.
- **`Cmd`+`End` walked a different sheet than the drawing does.** The corner it
  reported counted `cells:` only, so a spec whose rows come from a `formulas:`
  range stopped short of them — the cells hold a formula, whatever the drawing
  happens to reach. `drawing.ts` names that walk `corner` now and both callers
  use it, so what the sheet writes is decided once.
- **`Preview` said the same three things sixteen times.** `sheet()` for the
  lookup, `send()` for the post, and the panel's view type is `PANEL` beside the
  class rather than a bare string in two files.
- **Checked and left alone**, so the next pass need not look again: the exports
  that appear unused are types in exported signatures; `cst`'s
  `empty-mapping` / `empty-sequence` diagnostics are still unreachable and still
  worth having when a caller can reach them; `preview.ts` and the view's
  `index.ts` are long but have no logical seam — splitting either one would cut
  a message table in half (§8.3).
- **The README named a command that no longer exists.** *Open Preview to the
  Side* was renamed to *Open the Grid Beside the Spec*; the install steps now
  say which button in the title bar does it, and mention that the text half gets
  yxl's schema where `redhat.vscode-yaml` is installed.
- 2399 → 2406 tests. Comment shape: export 855 blocks / 1920 lines / avg 2.2,
  private 569 / 569 / avg 1.0, inline 135 / 215 / avg 1.6; 0 over the limit.

### 2026-08-29 — Replace, which is a write like any other
Phase 18's last line. `Cmd`+`F` found things and left the reader to retype them.

- **The find bar takes what goes there**, with *Replace* — the one they have
  gone to — and *Replace all*. The buttons are written into rather than rebuilt
  as the search finds things, for the same reason the formula bar is: the reader
  is typing in one of those boxes.
- **The refusals came for free**, which is the point. A replacement is an
  ordinary cell write, so `landed` already knew how to write many as one edit
  and count what stood in the way by group (§8 Q14). A `formulas:` range's
  anchor *is* found by a search and is not something a replacement may write —
  changing the formula there changes every cell it fills — so it refuses the
  whole and names the group, as a paste over the same cell does.
- **What `landed` needed was its own words.** The verb a refusal counts in was
  the string `'pasted'`, written into a function three gestures share; it is a
  parameter now, so *pasted*, *filled* and *replaced* are one function rather
  than the beginning of three.
- **What is replaced is what was searched**: a cell's value, or a formula's
  body, as `finds` matches them. The new text is read the way a reader's
  keystrokes are, so `2400000` with `24`→`25` stays a number.
- **A cell found by the value *cached* under its formula is counted rather than
  passed over.** A reader replaced 45 cells and was told 44 were written, which
  is the sort of silence this editor is supposed not to keep: `finds` matches
  what a cell holds, and for a formula cell that includes Excel's own answer.
  Typing over that is writing down a guess, so it refuses with its group — and
  *Replace the ones that can be* is the answer, as it is for a paste.
- **A search a reader can close.** `Esc` worked only inside the box that opened
  it, so a reader who had gone back to the grid had no way out at all. There is
  a `✕` on the bar now, and `Esc` answers from anywhere in the panel. The bar
  wraps as the toolbar does: with two more controls on it, *Replace all* was off
  the edge of a narrow panel — which is the whole reason the toolbar wraps.
- 2386 → 2399 tests. Comment shape: export 850 blocks / 1907 lines / avg 2.2,
  private 570 / 570 / avg 1.0, inline 135 / 215 / avg 1.6; 0 over the limit.

### 2026-08-29 — `Home` and `End` go the same way as the arrows
Phase 17 left `End` reading the drawn window, on the reasoning that a window is
wider than almost every sheet. A reader asked for it anyway, which is the right
call: *almost* is not a rule, and the seam was already open.

- **The message names the end rather than the step.** `Cmd`+arrow asks for a
  block in a direction, `End` for the row's last cell, `Cmd`+`End` for the
  sheet's corner — one question, one answer, and the host walks its own cells
  for all three (ADR-019, ADR-043).
- **`Cmd`+`End` came free.** The host that knows a row's last cell knows the
  corner of what the sheet writes, which is where a spreadsheet puts it — a cell
  that may itself hold nothing, as in Excel.
- **`Home` needed nothing.** The first cell of a row, or of the sheet, is where
  it is whatever is drawn.
- **The view no longer reads the window to move at all.** `going` lost the map of
  drawn cells it was handed, and the fixture that built them went with it — the
  clearest sign the seam is now in one place rather than two.
- 2382 → 2386 tests. Comment shape: unchanged.

### 2026-08-29 — The spec's own schema, in the half this editor does not draw
Phase 18's third line, and the cheapest thing on it: ten lines of manifest for
completion and inline errors in the *text*, which is half of what this project
is for and none of what it draws.

- **Upstream generates the schema** (§8 Q7), so there is nothing to write: a
  `yamlValidation` contribution points `redhat.vscode-yaml` at it for
  `*.yxl.yaml`, and the YAML half of the editor starts answering.
- **It is carried, not fetched.** A reader on a train still gets it, and §8 Q6
  pins this editor to one yxl version — validating the text against whatever
  `main` says today would be a different rule from the one the loader and the
  compiler follow.
- **A copy is only safe while something checks it.** A test compares it byte for
  byte with the checkout next door and says how to take a new one
  (`SCHEMA=write pnpm test tests/schema.test.ts`) — the same shape the README's
  coverage table already uses, so a version bump carries the schema in the same
  commit rather than leaving it to be noticed.
- **The YAML extension is not a dependency.** Without it the contribution is
  inert and everything else works; forcing an install for one half of one
  feature is not this editor's call to make. Phase 20's README says so.
- 2380 → 2382 tests. Comment shape: unchanged.

### 2026-08-29 — Build, where a reader can click it
Phase 18's second line, and the half of *where a reader finds any of it* that
needed no upstream.

- **`yxl.build` was already good and unreachable.** It builds to a sibling
  `.xlsx`, offers *Open it*, warns about a version mismatch in both directions
  and answers a missing compiler with the install link — from the command
  palette, which is where a command goes to hide.
- **It is in both title bars now**, with *Check* beside it: the spec's own
  editor and the preview. The text and the grid are two views of one spec, so a
  command about the spec belongs wherever the reader is looking at it — and the
  manifest suite pins it, failing a `when` that names one surface and not the
  other.
- **Which spec is decided by what has the keyboard.** `activeTextEditor` holds
  the last text a reader touched, which may be another spec entirely; so a grid
  in front of them is the subject where there is one, and the text otherwise.
  `panel.active` is the live answer — the panel this editor remembers is only
  the last one to have been active, which is a different question.
- 2379 → 2380 tests. Comment shape: unchanged.

### 2026-08-29 — Where a starter spec belongs, decided by giving it away
A day's work closed rather than merged, which is the entry worth writing.

- **The template was written here, and should not live here.** *New Spec* wrote
  a minimal spec into the extension, checked against the compiler, with the
  discoverable places to reach it. A reader asked for it to be upstream instead,
  and the argument holds: a starter spec is a statement about the **format**,
  the format is `yxl`'s, and a copy kept here drifts and is invisible to anyone
  using the compiler without this editor — which is exactly why `extract` is
  upstream and not a gesture in this panel (ADR-011). PR #165 is closed.
- **[yxl#77](https://github.com/t-ujiie-g/yxl/issues/77) filed**, carrying what
  the day found rather than only the request: the starter should be an **empty
  sheet**, not a worked example — a heading row and a `SUM` look helpful and are
  the first thing a reader deletes — and `sheets:\n  - name: Sheet1\n` already
  compiles and builds, so the command is small. The shape proposed matches the
  CLI it joins (`yxl init -o <spec.yxl.yaml>`), and the two decisions that are
  upstream's — an existing file, the sheet's name — are named as theirs.
- **The editor's half is a run, not a write**, when it lands: ask where, run the
  compiler, open the file and the grid. A pinned CLI without `init` degrades
  with a sentence, as a missing one already does (§8 Q6).
- **The palette is not a place a reader finds anything**, which is the other
  half of what they said. Whatever creates a spec has to be in *File → New
  File…* and the explorer's own menu; that is written into Phase 18 with the
  command rather than left as a preference.

### 2026-08-29 — A column width Excel agrees with, to the pixel it can
Phase 17's last line, and the arithmetic half of §8 Q19.

- **A width is a count of `0`s, and a cell keeps five pixels around them.** That
  is Excel's own formula, and this editor had the first half without the second:
  `8.43 × 7` is 59, and every workbook opens at **64**. Every column was five
  pixels narrow, and a fitted width came back about two thirds of a character
  too wide, because the measurement added our own ten pixels of padding while
  the conversion took none of them off.
- **The cell now keeps what Excel keeps**: two pixels either side and the
  gridline, rather than four and the gridline. So a width means the same thing
  in both, and a fit — the text measured, plus that same five — lands on exactly
  the width Excel's own AutoFit would.
- **Twelve tests carried the old numbers.** They say the new ones with the rule
  written beside them, and the round trip a drag makes — pixels to a width and
  back — is pinned at Excel's default rather than at a literal nobody can check.
- **The font half is not fixed and cannot be fixed here** (§8 Q19). The canvas
  measures whatever face the machine substitutes for Calibri, and on macOS that
  is never Calibri. A fitted width is this editor's best guess at Excel's, which
  is what the README will say rather than implying a promise.
- 2379 tests, unchanged in number: this pass moved what they assert, not how
  many. Comment shape: unchanged.

### 2026-08-29 — The number a phase runs in, and the two seams that bit twice
No code. A reader read §6 and asked why Phase 16 sits below Phase 20, which is
the right question: the number is how §10 picks the next task, so a number that
disagrees with the order is one every reader has to work around.

- **The deterministic refactors are Phase 21.** They have run last since
  2026-08-23 and kept the number 16 through it. §6's preamble now says the rule
  once — *the number follows the order* — and says why there is no Phase 16.
  The gap is left rather than closed: five §11 entries and the pull requests
  they name say Phase 17, and those are history rather than plans.
- **Two items added to Phase 17**, from the same reader's afternoon: four
  defects that turned out to be two. *Where the keyboard is* was decided in five
  places that cannot see each other, so a control could take it and nothing put
  it back. *What crosses the window's edge* is asked of the host by `fit`, `sum`,
  `edge` and `copyOut`, and by nothing else — so the next gesture that reaches
  past the window will be the next defect unless the boundary itself is pinned.
- Both were found by a reader on a running preview while every test passed. That
  is the note worth keeping: the suites here are strong on values and blind to
  where the keyboard is, which is a shape of test this project has not needed
  until it started being used.

### 2026-08-29 — A copy that reaches past the window, and the key after a jump
Two from one reader session, and the first is this morning's own consequence.

- **Copying a big selection said no.** *This reaches past what the preview has
  drawn* was a sentence almost nobody met, because a selection could not run past
  the drawn window — until `Cmd`+`Shift`+arrow started reaching the sheet's edge.
  Then it became what a reader gets for selecting a column of four hundred rows
  and pressing `Cmd`+`C`.
- **The host writes that one, as values.** Two flavours can only go on the
  clipboard inside the gesture (ADR-035) and a round trip is not inside one, so
  the split is by what the view has: a rectangle it has drawn keeps its look, one
  it has not is written by the host through `vscode.env.clipboard`. The text
  comes back to the view, because that is what tells a later paste whose it is.
  The sentence under the grid says which it was rather than saying no.
- **The first key after a long jump reached nothing.** The drawing that answers a
  window the view asked for put the keyboard back only where the page happened
  to still have it. The view *asked* for that window — the reader is in the grid
  by construction — so it puts it back on the selected cell. That is why
  `Cmd`+`Shift`+`→` after a `Cmd`+`Shift`+`↓` did nothing the first time and
  worked the second.
- 2373 → 2379 tests. Comment shape: export 843 blocks / 1878 lines / avg 2.2,
  private 563 / 563 / avg 1.0, inline 131 / 207 / avg 1.6; 0 over the limit.

### 2026-08-29 — The keyboard, put back where the question took it from
A reader said copying had stopped working. It had, and so had every other key:
the question this morning made a control the keyboard goes *into*, and nothing
put the keyboard back when the question went.

- **What it was.** `asking()` removes the question and, with it, the button that
  had focus — so `document.activeElement` fell back to the page body. The grid
  answers keys from the *cell*, so from that moment `Cmd`+`C`, the arrows and
  `Delete` all reached nothing. Copy is what a reader notices first, because it
  is the one that fails silently: the others look like a grid that has stopped.
- **The fix is three lines** and one test that fails without them: if the
  question held the keyboard when it went, the selected cell takes it back.
- **Also**: setting `webview.options` reloads a webview, and the panel this
  editor creates already has them — so only a *revived* panel is given them now.
  Every preview opened since yesterday was loading its page twice.
- **What is still unproven** is the reader's other half: whether copy works from
  a preview that has never shown a question. Nothing in the copy path has
  changed — `clipboard.ts`, `keys.ts` and `table.ts` are untouched since
  before — and ADR-035 says `execCommand('copy')` was measured working in the
  extension host, so the focus is the likeliest whole answer. It is a question
  for the reader's next run rather than a claim to make from here.
- 2366 → 2367 tests. Comment shape: unchanged.

### 2026-08-29 — `Cmd`+arrow reaches the sheet, not the window
Phase 17's fourth line, and the one a reader hit with a long column: `Cmd`+`↓`
stopped partway down.

- **The view was answering a question it cannot see the end of.** `edge()` walked
  `held` — the cells of the *drawn window* (ADR-019) — so a block longer than the
  window looked to it like a block that ends there.
- **The key names the step; the host names the cell.** `edging` says which way a
  `Cmd`+arrow goes, `edges.ts` walks the sheet's own cells, and the view goes to
  the address it gets back — through the same `goToCell` that already moves the
  window when the answer is outside it. That is ADR-043's shape, which fitting a
  column already uses: the host has every cell, the view has the window.
- **`Shift` rides along.** It goes out on the question and comes back on the
  answer, so neither side keeps a note of what was asked.
- **The old walk is gone**, not left beside the new one. Its three tests moved to
  the host, where the case that started this is one of them: four hundred rows,
  of which about fifty are ever drawn.
- **`Home` and `End` have the same seam**, and are deliberately left: `End` reads
  the drawn window too, but a window is wider than almost every sheet, so it is
  wrong only where a sheet runs past the columns drawn. The same call answers it
  the day that matters.
- 2367 → 2373 tests. Comment shape: export 841 blocks / 1869 lines / avg 2.2,
  private 560 / 560 / avg 1.0, inline 129 / 203 / avg 1.6; 0 over the limit.

### 2026-08-29 — A command a reader can find, and a way back
Phase 17's third line. *Open Preview to the Side* named neither yxl nor a grid,
and it sat in the editor's title bar as a line of text.

- **Named for what it opens**: *Open the Grid Beside the Spec*. The palette says
  `yxl` for it already — that is what `category` is — so the title does not.
- **An icon**, `$(table)`, which is what makes a title-bar entry a button rather
  than a word wedged between the others.
- **A way back.** *Go to the Spec Behind the Grid* sits in the *preview's* title
  bar, under `activeWebviewPanelId`, and puts the reader in the editor the spec
  is already open in — a third column is not a way back. The preview a reader is
  in is tracked by `onDidChangeViewState`, which the panel already listens to.
- **`tests/manifest.test.ts`**, because nothing else in this repo can see what
  the editor contributes: a command a menu names and nothing declares is a button
  that does nothing; a title-bar button with no icon is the line of text this
  entry is about; a command declared and never registered is a palette entry
  that answers nothing. It reads the registrations out of `extension.ts`, which
  is the only place they are, and names the one deliberate exception —
  `yxl.keepKey` is bound and registered and undeclared, since a key taken from
  VS Code is not an offer to a reader (ADR-046).
- Two of the suite's four checks fail on the manifest as it was, which is what
  makes them a suite rather than a description.
- 2362 → 2366 tests. Comment shape: export 836 blocks / 1856 lines / avg 2.2,
  private 561 / 561 / avg 1.0, inline 127 / 199 / avg 1.6; 0 over the limit.

### 2026-08-29 — A refusal is a question now
Phase 17's second line. The answers to a refused edit were a panel under the
grid, and the grid behind it still took keystrokes — so the one thing a reader
needed to know, *did my edit happen*, was the one thing the panel did not say.

- **It takes the panel until it is answered.** The first answer has the keyboard
  when it opens, `Tab` goes round the answers rather than out of them, `Esc` and
  *Leave it as it is* take it back, and the ground behind it absorbs a click
  rather than dismissing a question about the reader's own edit. What it carried
  came with it: each answer's count and sample cells (§8 Q14), the exception,
  and the reason that goes in the file beside it.
- **An answer taken closes it at once**, rather than waiting on the host — the
  reader has answered, and the host's reply is a new drawing or a new question.
- **A drawing closes it too**, which is the rule that was not there before: the
  answers were worked out against the text as it was, so a spec changed since is
  not the one the question was about. The reader can still edit the YAML while
  the question is up — the trap is the panel's, not VS Code's.
- **A redraw with the same question open leaves it alone**, or it would take back
  the keyboard and the half-typed reason.
- **Not `<dialog>`**, though `showModal()` is the right element and would give
  the trap for nothing: **jsdom 30 does not implement it** — measured before
  choosing, not recalled — so the shipped path would have been the one no test
  runs. Ours is `role="dialog"`, `aria-modal`, and a focus trap of about a dozen
  lines, and every rule above has a test.
- **A colour is the one thing none of them can see.** *Leave it as it is* went
  out as a control with a ground of its own and a foreground taken from the
  description text: grey on grey, which a reader read back to us from a
  screenshot. It takes the editor's own button pair now, falling back to the
  primary pair where a theme declares no secondary one, so the two always come
  from one place. jsdom does not resolve `var()` — measured — so no suite here
  could have caught it, and the honest note is that looking is what did.
- 2357 → 2362 tests. Comment shape: export 836 blocks / 1856 lines / avg 2.2,
  private 559 / 559 / avg 1.0, inline 127 / 199 / avg 1.6; 0 over the limit.

### 2026-08-29 — A preview that comes back when its tab does
Phase 17's first line, and the defect a reader photographed: two previews open
in one column, and the one that lost the tab came back blank.

- **The cause was a webview that had been torn down and a host that had stopped
  talking.** VS Code destroys a hidden webview unless told otherwise, and
  reloads the page when the tab comes back; this host only posts a drawing when
  the text changes, so the reloaded view sat there with nothing. The same hole
  swallows a *first* drawing posted before the webview is listening, which is
  why the panel worked only because a redraw happened to come later.
- **The fix is a handshake.** `wire()` posts `ready` as its last act, and the
  host answers with the drawing it already holds — no recompute, since `redraw`
  keeps `drawn` up to date whether or not the post lands.
- **The flag is a separate choice, about the reader rather than correctness.**
  `retainContextWhenHidden` keeps their selection, their scroll and their open
  menu, which the host has no way to send back. The grid draws a window rather
  than a whole sheet (ADR-019), so what is held is bounded.
- **A window reload is the other way a panel goes empty**, and a
  `WebviewPanelSerializer` answers it: the view keeps the one thing it cannot be
  given back — the spec it was drawn from — in VS Code's own `setState`, and a
  revived panel is handed to a `Preview` that starts as any other does. A state
  with no file, or a spec moved since, closes the panel rather than showing an
  empty grid.
- Two tests, both on the view's half, which is the half that has any: it says
  `ready` before anything else, and it keeps the file it was drawn from. The
  host's half is `vscode`, which this project deliberately does not mock (§6) —
  so it was checked by hand, and the steps are in the PR.
- 2355 → 2357 tests. Comment shape: export 836 blocks / 1855 lines / avg 2.2,
  private 556 / 556 / avg 1.0, inline 125 / 195 / avg 1.6; 0 over the limit.

### 2026-08-29 — The release programme, from a reader's own list
Phase 15 closed this morning, and the next thing is not more schema: it is a
reader working in the preview and writing down what stopped them. §6 gains four
phases from that list, and they come **before** the deterministic refactors,
which stay last.

- **Phase 17 — What a reader hit first.** Four defects with a cause named
  against each — a second preview that comes back blank (no
  `retainContextWhenHidden`, no `onDidChangeViewState`, and a host that only
  sends a drawing when the text changes), `Cmd`+arrow stopping at the drawn
  window rather than the sheet's edge (`edge()` walks the window's cells,
  ADR-019), a command called *Open Preview to the Side* that names neither yxl
  nor a grid, and a fitted column width Excel disagrees with — plus the answers
  to a refused edit becoming a modal you have to answer rather than a panel the
  grid keeps taking keystrokes behind.
- **Phase 18 — From nothing to a workbook.** A new spec from a template, and
  `yxl build` where it can be clicked. Checked before writing it down: `yxl
  0.3.5` has `build` and `extract` and **no `init`**, so no upstream issue is
  needed — a starter file is the editor's business, and asking for one would put
  the same file in two places. Two proposals ride with them: pointing the YAML
  extension at upstream's own `docs/yxl.schema.json`, which is ten lines of
  manifest for completion and inline errors in the *text* half, and replace.
- **Phase 19 — 日本語 and English.** The work is not translation but where the
  words are: today they are English prose built at the place the thing goes
  wrong. The first item is the decision (§8 Q18), because three hundred
  refusals rendered from a code and its parts is a different project from three
  hundred sentences carrying two languages each.
- **Phase 20 — Shipped.** §8 Q6's open half, made a checklist: a publisher, an
  icon, the package's own README — the marketplace shows that one, not the
  repo's — a `CHANGELOG`, a `.vscodeignore`, and a `.vsix` that installs on a
  machine that has never seen this repository.
- Two open questions with it: **Q18** (how deep the second language goes) and
  **Q19** (what a column width is, exactly, in Excel's arithmetic — where the
  reader's machine not having Calibri is the half no arithmetic fixes).
- Nothing was implemented in this change; it is the plan, written down before
  the work rather than after it.

### 2026-08-29 — What a sheet keeps in another file, said once
`docs/spec.md` §8's own example is `cells: { $include: … }`, and only two
gestures — a note and a link — said what that means for a write. The rest
refused in whatever words the layer underneath happened to use.

- **Nothing was ever damaged**, which is why this waited: a new cell beside an
  `$include` was refused by the checker with the loader's own sentence (*an
  `$include` replaces its whole node, so it takes no other key*), and a
  validation by the patch algebra's (*`validations` is already there*). Both are
  true and neither says what the reader did or what to do about it.
- **`keptElsewhere` in `direct.ts`** answers it once — *`Sales` keeps its cells
  in another file* — with the noun each key is read in (`comments` is *notes*,
  `data` is *data blocks*) in one table beside it. `setNote` and `setLink` keep
  the wording they already had, since it is where the sentence comes from.
- **Twelve write paths ask it**: typing into a cell nothing writes yet, pasting,
  keeping a rectangle as a `data:` block, and the gestures that write
  `validations`, `tables`, `charts`, `images`, `merges`, `comments` and `links`.
  Where the gesture is one of several *answers* rather than a refusal — a band
  of its own, a `formulas:` range — the answer is **not offered**, since an
  answer offered is one this editor can make (ADR-001).
- **A cell the included file writes is still edited there**, which is what the
  node ids already carried: only the keys a gesture would *add to* are refused.
- `included.test.ts` holds the rule in one place rather than a case per gesture;
  five of its seven checks fail on the old code, and the two that do not are the
  ones that pin what did not change.
- 2348 → 2355 tests. Comment shape: export 836 blocks / 1851 lines / avg 2.2,
  private 553 / 553 / avg 1.0, inline 121 / 188 / avg 1.6; 0 over the limit.

### 2026-08-29 — The fixtures the tests were copying
No behaviour changed. The §8 lenses over the whole tree, at the end of Phase 15;
581 lines net came out, and the two most-copied blocks in the repo are gone.

- **`intent` has a `harness.ts`**, as `compile` and `webview` already did.
  Twenty-four of its twenty-seven test files carried the same seven-line
  `files()` — load, compile, and the two readings a write takes — and nineteen
  of them the same eight lines of *apply it through the checker*, in two
  spellings: return `refused: …`, or throw. Those are `tried` and `wrote` now,
  and each test file starts at what it is actually about — the same move the
  view's fixtures got two changes ago, in the package that had the most copies.
- **`putEntries` in `anchored.ts`, and two hand-rolled copies of it gone.**
  `fill.ts` and `table.ts` each had a private `beside()` that put entries under a
  sheet's `formulas:` / `data:` key — the job `sequenceIn` + `putEntry` already
  did for `charts`, `images`, `validations` and `tables`. Both copies indexed
  the insert by *how many the projection drew* rather than how many the file
  writes, and both pathed their ops into whichever file the first entry lives
  in while naming the sheet's file on the patch. The shared one counts what the
  CST holds under the key, in the file the patch names. `putEntry` folded into
  `putEntries`, since one is the case of several.
- **`send` in `webview/index.ts`.** `refused = null; said = null;` was written
  thirty-two times — once per gesture — and is now the first thing the one
  function that posts a message does. 769 → 711 lines; the `asks` methods are
  mostly one line each again.
- **Three error paths nothing reached**: an elapsed time that is not one
  (`compile.bad-duration`), a parameter set from outside that the spec never
  declared (`compile.no-such-param`), and a block scalar with no body to take an
  indent from (`cst.empty-block-scalar`). All three now have a test; the first
  two needed `given()` in `compile/harness.ts`, which sets parameters the way the
  preview's panel does.
- **Checked and left alone**, with the reason: `cst.empty-mapping` and
  `cst.empty-sequence` are unreachable — the parser writes an empty collection
  only in flow style, and every path to them is guarded by the flow check first;
  the branches stay because the types need them. `webview/index.ts` is still one
  closure over twenty-two `let`s with no logical seam. `intent`'s `beside(file)`
  and the inspector's `nearTo` name the same file two ways (`specs/sales.csv`
  against `sales.csv`), which is what ADR-004 costs: a core package cannot use
  `node:path`, and reimplementing `relative()` for that is not worth it.
- A write under a sheet key the spec `$include`s is **refused by the patch
  algebra** (`\`validations\` is already there`) rather than duplicating the key —
  checked, since the consolidation above moved which file the ops name. Only
  `setNote` says *why* in so many words; the others say the shorter thing.
- Comment shape: export 835 blocks / 1846 lines / avg 2.2, private 551 / 551 /
  avg 1.0, inline 119 / 184 / avg 1.5; 0 over the limit.

### 2026-08-29 — What a sheet carries, said where the reader is
Phase 15's last line, and the phase closes with it. Four sheet keys are carried
through untouched and drawn as nothing — `pivots`, `controls`, `slicers`,
`background` — and until now the only place that was said was the README.

- **The inspector says it.** A sheet's opaque keys ride through `compile` as
  `carried`, and the panel lists them under *This sheet also holds, undrawn:*,
  each line a button that goes to the lines in the spec. What each one is comes
  from `coverageOf` in the coverage table, so the panel and the README cannot
  drift apart — the lookup that pass deleted for want of a caller comes back
  with one.
- **It is about the sheet, and does not pretend otherwise.** Where a pivot sits
  is not read, so nothing here claims to know which cells it covers; the cell's
  own answer is untouched, and a blank cell under a pivot still says *Nothing
  writes this cell* above the carried list. Reading a pivot's `at:` would make
  the key modelled and move its row out of *carried* — a decision for whoever
  previews pivots, not one to take by accident here.
- **Four test fixtures stopped being copies.** `draw`, `table` and `toolbar`
  each carried their own seventeen-field `Showing` literal, and each broke on
  the two fields these last two changes added. They use `showingOf` now, which
  is what it was for; 60 lines of fixture went with them.
- 2339 → 2345 tests. Comment shape: export 825 blocks / 1830 lines / avg 2.2,
  private 551 / 551 / avg 1.0, inline 119 / 184 / avg 1.5; 0 over the limit.

### 2026-08-29 — Rich text is edited, a run at a time
`rich:` was drawn on 2026-08-15 and read-only since. The bar over the grid now
edits it — the last of Phase 15 that is a gesture rather than a preview.

- **The bar picks a run** (ADR-050). Where the selected cell holds runs, a
  `select` names them by their first few words and the box beside it holds that
  run's text; `Enter` sends `editRun`, `Esc` puts the run back. A run's font is
  not touched: it is the run's own and nothing else in the workbook can reach
  it, which is the same reason the runs arrive resolved, not as a style layer.
- **A defect the feature uncovered.** Typing into a rich cell wrote a `value:`
  beside the `rich:`, which upstream's loader refuses (`cell '…' cannot combine
  'rich' and 'value'`) and ours refuses too — the write path was producing a
  file its own reader would reject on the next keystroke. It is refused at
  `valuePath` now, with the sentence that says where the runs *are* edited, and
  the cell wears the reason before anyone types: `Editable` has a fourth answer,
  `rich`, so the hover, the inspector and the refusal all say the one thing.
- **The checker could not see a run.** `verify`'s `diff` compared `value`,
  `formula`, `format` and the settled style, so *every* change to rich text was
  invisible to ADR-009: a patch could have retyped a run three sheets away and
  nothing would have been surprised by it. It compares the runs now — text and
  the look each wears — as part of what a cell holds, so the run edit is checked
  like any other write rather than waved through.
- **`rich: []` is refused**, as upstream's `rich text needs at least one run`
  does. Found by asking what the picker should do with no runs; the answer was
  that the spec does not have that shape.
- 2326 → 2339 tests. Comment shape: export 823 blocks / 1820 lines / avg 2.2,
  private 548 / 548 / avg 1.0, inline 119 / 184 / avg 1.5; 0 over the limit.

### 2026-08-28 — A parameter may fill a spelling
`docs/spec.md` §7 lets a `${...}` stand anywhere a scalar goes, and the schema
marks every one of its enums parameterisable. This editor read a dozen of them
against a closed vocabulary *before* substitution, so a spec yxl builds happily
was refused here with `loader.unknown-spelling` — confirmed on `sheet.visibility`,
`cells.type` and `images.positioning`, and true of nine more.

- **One shape for all of them.** `print.orientation` was already read through
  `readAs` and a `Kind`, which carries a placeholder as a `Template`;
  `spelling(vocabulary)` now makes any closed vocabulary into that same `Kind`,
  and `expectSpelling` is deleted rather than left as a second way in.
- **Twelve fields are `Templated<T>`** — a cell's `type`, a sheet's
  `visibility`, a border edge's `style`, `align.horizontal` and
  `align.vertical`, a chart's `type` and `legend`, a shape's `kind`, a float's
  `positioning`, a sparkline's `type`, a validation's `error.style`, and the
  orientation that started it.
- **Resolved once, in `compile`.** `spelling(ctx, said, vocabulary, node)`
  substitutes and then reads, reporting `compile.bad-spelling` where a
  parameter fills something the vocabulary does not have. A key with a default
  falls back to it (`visible`, `move`, `stop`); one that *is* the construct
  drops it, as an unreadable anchor already does — a chart, a shape and a
  sparkline group each disappear with the diagnostic that says why.
- **`tests/fixtures/accepted/`**, a third fixture class beside `refused` and
  `deferred`: a spec the compiler builds and this editor must read whole. The
  first one fills all twelve vocabularies from parameters; `yxl build --check`
  says `ok` and the loader says nothing. Every new test was run against the old
  reader first — 21 of them fail there.
- Comment shape: export 818 blocks / 1804 lines / avg 2.2, private 541 / 541 /
  avg 1.0, inline 118 / 183 / avg 1.6; 0 over the limit.

### 2026-08-28 — Named for what they hold
No behaviour changed. The §8 lenses over what the last three phases added; 303
lines net came out.

- **`standingOf` deleted.** Exported from `spec/coverage.ts` and re-exported
  from the index with **no caller anywhere and no test** — written for a Phase 15
  item that has not arrived. It comes back when the inspector needs it, and will
  then be written to fit what asks rather than to a guess.
- **`optionalNumber` and `flag` in `loader/read.ts`**, beside `optionalText`.
  "A number under this key of this mapping" was written five ways across
  `float`, `print` twice, and `sheet`'s `readSplit`; `flag` existed twice, in
  `table.ts` and `sparkline.ts`, with the second one unable to say what an
  absent switch means.
- **`print:` and `protect:` are not floats.** They had landed in
  `compile/float.ts` because that was the file open at the time, with their
  tests in `float.test.ts` and `floats.test.ts`, and `loader/print.ts` read
  `protect:` as well. Each layer that has them now has a `print.ts` and a
  `protect.ts`, and every file is named for what it holds — which is the loader's
  own convention (`note`, `link`, `table`, `validation`) applied where it had
  slipped.
- **`protected_` is `locked`.** A trailing underscore dodging a reserved word is
  a name nobody would choose twice.
- Layers clean, no deprecation warnings, README's coverage table generated and
  gated, no roadmap or phase codes in the sources.
- Comment shape: export 818 blocks / 1801 lines / avg 2.2, private 541 / 541 /
  avg 1.0, inline 118 / 183 / avg 1.6; 0 over the limit.
- **Still standing from the last pass, unchanged**: `webview/index.ts` (750
  lines, one closure over 22 `let`s, no logical seam), and `naturalSize`
  exported only for its own test, which is the pure half of ADR-004's split.

### 2026-08-28 — Two things the frozen band and a blank cell were saying wrongly
Found by reading a scrolled `layout.yxl.yaml`, which is the only example with
both a column outline and a freeze.

- **A row was drawn above the frozen band.** `.grid thead th` pins every heading
  row at `top: 0`, so a sheet with a column outline had its two heading rows
  *overlapping* — while `pinned()` offset the frozen band by `thead`'s full
  height, counting both. The band landed a row too low, and the strip between
  the headings and it was where the scrolling rows showed through. `pinned` now
  stacks the heading rows and the frozen rows in one pass, each told where the
  ones above it left off. Both tests for it fail on the old arithmetic.
- **The column outline's gutter was not one of the things that stay.** Fixing
  the arithmetic above uncovered the other half: `.grid th.outline` is sticky,
  and the gutter row over the *columns* is made of `td`s, which were not. While
  the two heading rows overlapped nobody could tell — the letters row covered
  the gutter entirely. Stacked, the gutter took its own strip, scrolled away
  with the table, and the rows passing behind showed through where it had been.
- **`tests/staying.test.ts` is the one suite that loads `view.css`.** Both of
  these were invisible to 2300 tests because what stays put is decided by
  `position` and `z-index` and by nothing the DOM says. It renders a sheet with
  a gutter *and* a freeze and asserts every cell that has to stay is stuck and
  has a ground of its own; it fails on the stylesheet as it was. It lives in
  `tests/` because only the shell may read a file (ADR-004), and `tests/` — the
  tier above every layer, not a package — takes the DOM lib for it. No package's
  tsconfig changed, so `document` in a core package is still a compile error.
- **A blank cell in a formatted column claimed it could not be typed into.**
  `typeable(null)` answered `mediated` for every cell the projection drew
  without one behind it, and a band's `format:` is enough to have it drawn — so
  `layout.yxl.yaml` wore *cannot be typed into* down forty empty rows of two
  columns. Typing there writes one `cells:` entry and always did; the write path
  was asked and did it without a question. A blank cell is `direct` now, unless
  a `formulas:` range covers it, where the answer really is asked.

### 2026-08-28 — What prints, and what is locked
`print:` and `protect:` were carried through blind. Both are modelled now, and
drawn as far as a preview honestly can.

- **The print area is outlined** where it falls, and each `breaks:` cell draws
  the two lines it starts a page with — above it and left of it, and neither
  where that is the sheet's own edge.
- **The rest is said under the grid** — the way round, the margins in inches,
  the scaling, the `&`-coded running heads — ending in *it does not paginate*. A
  preview that drew pages would be drawing Excel's arithmetic rather than the
  spec's words. `scale:` with `fit:`, and a break at `A1`, are refused as §5
  says.
- **The marking is the other way round from what this phase first wrote down.**
  Excel locks every cell, so a protected sheet has nothing worth marking except
  the cells a style *unlocks* — a form's input boxes, which §16 says is what the
  key is for. Those are outlined.
- **The password never leaves the compiler.** What is projected is that one is
  set. A spec is version-controlled and §16 says to pass one with `--set`; a
  preview that echoed it would undo that advice.
- `open`, `required`, `optional` and `optionalText` moved from `loader/float.ts`
  to `loader/read.ts`, where the rest of the readers live: a third construct
  wanted them, which is one more than a private home survives.
- Comment shape: export 818 blocks / 1804 lines / avg 2.2, private 543 / 543 /
  avg 1.0, inline 114 / 176 / avg 1.5; 0 over the limit.

### 2026-08-27 — The schema, said honestly and in one place
Every key `docs/spec.md` gives a document and a sheet is now in one of three
states in the code — **edited** by a gesture here, **drawn** but written by
nobody, or **carried** through untouched — and the README's table is written
from that rather than beside it.

- **`spec/coverage.ts`**: ten document keys, twenty-eight sheet keys, each with
  its standing and a sentence saying what that comes to.
- **Three checks, each made to fail before it was trusted.** The list is exactly
  what upstream's `docs/yxl.schema.json` declares, in its order, so a key the
  schema grows is a failing test rather than a silence. **`opaque` is a
  consequence rather than a claim**: a key `MODELED_KEYS` does not list *is*
  carried, and the table is checked against that. And the README's block is
  compared against the rendered table.
- **`COVERAGE=write pnpm test tests/coverage.test.ts`** writes the README block;
  the same test fails when it is stale. In the commands table.
- What no machine can check is **edited against drawn** — that one is a sentence
  per key, kept in the code beside the gesture that would falsify it.
- The first pass of this wrote the checks and *believed* them; two of the three
  turned out to match nothing, because `pnpm format` had rewrapped the table the
  probe was grepping for. They were rewritten until each one failed on demand.

### 2026-08-27 — A tidying pass over the tree
No behaviour changed. The §8 lenses, walked in order, over the whole tree; 341
lines net came out.

- **16 schema keys routed back through `KEY`.** The table exists so a key is
  spelled once, and the writer layer was spelling `'at'`, `'values'`, `'data'`
  and `'style'` by hand in seven files. The other 31 literals the scan turned up
  are union discriminants that happen to share a word — `Shape = 'cells' |
  'data'`, `Does.of`, `Whole` — and are left alone: the type checker owns those.
- **Three constants given one home**: the SVG namespace and the
  `createElementNS` helper, declared in both files that draw one, now live in
  `marks.ts`; and `pixelsOf` in `window.ts`, since `draw.ts` and `float.ts` each
  recomputed `(points * 4) / 3` beside a `PER_POINT` they could not see.
- **`itemOf` in `intent/anchored.ts`**: "this body as the first item of a
  sequence" was written five ways across `bands`, `fill`, `table`, `override`
  and `anchored` itself.
- **`rectIn` in `extension/write.ts`**, beside `sheetNamed`: a `Ranged` is a
  `Rect` and a sheet, and eight gestures unpacked it a field at a time.
- **The view's test fixtures stopped being copied.** Six test files each carried
  their own `cell()` and `sheet()` — byte-identical to `harness.ts`'s but for a
  default or two — which is why the last three phases each had to patch all six.
  They use the harness now, with the default that differs kept as a two-line
  wrapper that says why it differs.
- **`webview/sparkline.ts` split out of `float.ts`** (625 lines → 495 + 124). One
  seam, not a line count: the overlay floats *over* the grid and `draw.ts` uses
  it; a sparkline is drawn *inside a cell* and `cell.ts` uses it.
- **No roadmap or phase codes left in the sources.** §8.6 bans them, and there
  were 24 — a `Phase 8`, and 23 pointers at `§4.4`/`§4.5`/`§8 Q6`/`§9 R5`, most
  of them bare, so a reader who never opened `ROADMAP.md` could not tell which
  document they named. Each names the thing now: "the resolution table", "the
  `setSize` table", "`layers.json`". `docs/spec.md §n`, `ADR-nnn` and
  `ECMA-376 §n` stay — those are stable and findable.
- **Considered and left alone**: `naturalSize` is exported only for its own test,
  which §8.2 calls a smell — but it is the pure half of ADR-004's I/O split, and
  testing byte-header parsing through the filesystem would be worse. And
  `webview/index.ts` (750 lines) is one closure over 22 `let`s: a smell with no
  logical seam, since the only split is a redesign of the view's state model.
  §8.3 says not to split for a line count, so it stays until there is a reason.
- Layers clean, no deprecation warnings, ROADMAP checkboxes match the code.
- **`@types/node` 26.2 → 26.3**, as its own commit. `@types/vscode` is 30 minors
  behind and **stays** at `~1.104.0`: it has to describe the *oldest* VS Code
  `engines.vscode` claims to support, not the newest, or code compiles against
  an API the host it claims to run on has not got.
- Comment shape: export 795 blocks / 1741 lines / avg 2.2, private 533 / 533 /
  avg 1.0, inline 112 / 172 / avg 1.5; 0 over the limit.

### 2026-08-27 — A comment stays with what it is about
Adding a key to a mapping put it *above* the comments that ended the mapping, so
`# the pivot above is not modeled yet` came to sit under the chart written after
the pivot. Every byte survived — what moved was what the comment was next to.

- **`belowComments` in `cst/lines.ts`** is `aboveComments` read the other way,
  and the three places that append use it: a key with a block under it, a key
  with a scalar, and an item at the end of a sequence.
- **Two rules decide what belongs to what is above.** A blank line ends the run,
  which is the rule `aboveComments` already used — a comment set off by one is a
  heading for what follows. And a comment indented less than the entry belongs
  to the outer level, not to this mapping; a sequence measures at the `-` rather
  than at the content it opens, since that is where an item's own comments sit.
- Every gesture that adds a key gets this, not only the ones that write a float:
  `tables:`, `links:`, `validations:`, `merges:`, `formulas:`, `cells:` and the
  rest have all placed a key this way since Phase 11.
- Comment shape: export 790 blocks / 1736 lines / avg 2.2, private 536 / 536 /
  avg 1.0, inline 112 / 172 / avg 1.5; 0 over the limit.

### 2026-08-27 — What is still carried, proved against what is written beside it
No behaviour changed. The last of Phase 14 is a claim, and it now has the test
the claim needs.

- **The preservation suite carries its constructs through a float write.** It
  proved byte-identity across a *cell* edit; a float is written under the
  **sheet**, which is exactly where the keys this editor still carries live. It
  now carries them through a chart put in, an image put in, a float moved and a
  float resized as well — byte-identical and in the order written, over yxl's
  whole corpus, with a check that all four writes are really made so a suite
  that quietly skipped them could not stay green.
- **The nine still-carried keys are named**: `active`, `background`, `calc`,
  `controls`, `pivots`, `print`, `properties`, `protect`, `slicers`
  (`docs/spec.md` §5, §13, §14, §15, §16, §20, §21). Modelling one is now a
  deliberate change to a list rather than a number quietly going down.
- **A finding, filed rather than fixed** (Phase 14): a comment ending a sheet is
  left behind by a key added after it, because `addedBlock` lands a new key at
  the end of the last *entry*. Every add-a-key gesture since `tables:` has done
  this, so the fix belongs in `cst`, under the Tier 2 gate, as its own change.

### 2026-08-27 — Moving one, and sizing it
A float can be dragged to another cell and grown by its corner. Both are edits
to the construct's own anchor and extent, never to a picture (ADR-029), and both
send once on the way up — every step of a drag would be an edit.

- **A move rewrites `at:` and nothing else.** The drop lands on a *cell*, since
  that is what an anchor is; the `offset:` an image already carries comes off
  before the cell under the corner is looked up, so the corner lands where it
  was dropped and the offset survives. One anchored where a parameter says is
  refused rather than written over.
- **A resize writes what the construct itself says**: a chart's and a shape's
  `size:` in whole pixels, and an image's `scale:`, which is a factor over the
  file's own size. The host measures the file first; one it cannot measure is
  refused with the reason, and a drag back to the file's own size takes the key
  off rather than writing `scale: 1`.
- **The entry is named to the view by its `NodeId`**, not by its place in the
  sequence: a malformed entry earlier in the file would shift an index, and an
  id survives an `$include`.
- Comment shape: export 788 blocks / 1730 lines / avg 2.2, private 536 / 536 /
  avg 1.0, inline 111 / 171 / avg 1.5; 0 over the limit.

### 2026-08-26 — Putting one there
A chart and an image can be inserted from the cell's own menu. Both are
`nothingChanges` writes: a float sits above the grid and moves no cell under it.

- **A chart over the selection**, read as Excel reads a table: the left column
  labels the points, every column beside it is a series, and the top row names
  them where it is text over values. Which shape it takes is **asked, not
  picked** (ADR-001) — eight answers, one per shape — since the shape is not in
  the selection. It floats one empty column past the cells it plots.
- **An image from the editor's own file dialog**, since a webview has none and
  resolving a path is the host's (ADR-004). Written relative to the spec and
  with `/` whatever the platform, which is how yxl resolves one. A format Excel
  does not decode is refused by name rather than left to the compiler.
- **A plate too small for a name wears the mark alone.** A 48 × 48 logo drew a
  file name clipped to `asset…`, which says less than nothing; the plate is
  marked as a picture now, and named only where the name fits. The hover keeps
  it either way.
- **`sequenceIn` in `intent/anchored.ts`**, beside `anchored`: a float is
  anchored at one cell, so the entries under its key are not read against a
  rectangle. `anchored` is now that plus the overlap it looks for.
- Comment shape: export 779 blocks / 1701 lines / avg 2.2, private 523 / 523 /
  avg 1.0, inline 109 / 167 / avg 1.5; 0 over the limit, including the four the
  entry below left there.

### 2026-08-26 — What sits on the sheet, drawn
Charts, images, sparklines and shapes were opaque and invisible — the largest
hole in the preview. All four are modelled now, and each is drawn where it sits
and at the size it takes. A sketch, never Excel's rendering of one (ADR-029).

- **Read rather than carried**: `charts:` with its series, axes, legend and
  size; `images:` with `scale`, `offset` and `positioning`; `shapes:` with all
  twenty-three geometries, the fill, the outline and the text a line at a time;
  `sparklines:` both ways a group is placed, with its bounds, weight and marks.
  Every key `docs/spec.md` §12, §13, §18 and §19 gives them.
- **A chart is an outline, a title, a legend and a mark of its type.** The
  legend goes on the side the spec asks for and names each series — by its
  `name`, by the cell `name_from` reads, or by the range it plots. In greys:
  the colours a chart is finally drawn in are the workbook's, not ours. What
  will not fit — the ranges, the axis bounds — is on hover.
- **An image takes the room its own file says.** The host reads the extent out
  of the header (PNG, GIF, BMP, JPEG, SVG) rather than decoding the picture,
  which is ADR-029 applied to the one construct whose extent is not written
  down. A format whose header this does not read says so instead of guessing.
- **A sparkline is a real plot**, and the one place that is honest: it is drawn
  from the values the sheet already holds — the same values a `data_bar` is —
  evaluated where there are any, display only (ADR-014). Each is scaled to its
  own points, which is how Excel scales one unless the group says otherwise.
- **`parseQualifiedCell` in `units`**, beside `parseQualifiedRange`: a series'
  `name_from` may name its sheet and usually does not, and `parseQualifiedAddr`
  is §23's, which requires one.
- Q13 is answered: hand-written DOM and SVG, and no runtime dependency.
- Comment shape: export 779 blocks / 1701 lines / avg 2.2, private 521 / 521 /
  avg 1.0, inline 108 / 165 / avg 1.5; **0 over the limit**. The four this pass
  first left over the limit are trimmed in the one below — `git stash` had left
  the new files untracked and in place, so the baseline it was measured against
  was not one.

### 2026-08-25 — A tidying pass over the tree
No behaviour changed. The §8 lenses, walked in order, over the whole tree.

- **Five orphaned doc comments reunited with what they describe.** A doc left
  behind by a moved declaration had come to rest above an unrelated one, so that
  declaration carried two docs and the first was about something else —
  `drawn()`, `writing()`, `columnsOf()`, `expectText()` and a test helper each
  got theirs back. `scripts/comment-shape.mjs` does not catch this; a check for
  it is a line in `#N` if it happens again.
- **`writtenSheet()` in `intent/direct.ts`**, beside `located` and `keyed`: the
  five-line "find the sheet, read its node, insist it is a mapping" prologue was
  written out in seven gestures. It hands back the compiled sheet too, so
  `freeze` and `setTab` stopped reaching for `sheetOf` separately. Their guards
  now run *after* the file is known to hold the sheet, which is the same order
  every other gesture already used.
- **`intent/anchored.ts`**: `validations:` and `tables:` are both a sequence of
  entries anchored at an `at:` range, and `validation.ts` and `region.ts` had
  `rectAt`, `itemOf`, `taken` and a `Where` interface between them verbatim.
  One module now says what such a key holds, what goes into it, and what comes
  out of it; the two gestures kept only what is theirs.
- **`webview/wears.ts`**: `table.ts` had grown to 713 lines with a clean seam in
  it — everything from the filter mark down was *what a cell wears and what it
  says on hover*. That is its own module now (`table.ts` 713 → 599).
- `KEY.cells` where `'cells'` had been written bare, in five places in `intent`.
- Doc comments on thirteen exports whose names did not say it, `drawn()` and
  `locate()` among them. The derived type aliases and the eleven `Kind<T>`
  constants were left bare on purpose: a doc there restates the code (§8.6).
- A test for an anchored entry whose `at:` is a `${param}` — it covers no
  rectangle in the file, and nothing had pinned that.
- **Left alone, with reasons.** `webview/index.ts` is one 654-line `wire()`
  closure over 22 mutable variables; splitting it means a state object and a
  rethread of every `Asks` callback, which is architecture rather than tidying
  and wants its own change. `extension/preview.ts` is mostly the `WRITES`
  dispatch table, and a table is one list. `@types/vscode` stays at 1.104 to
  match `engines.vscode`.
- Comment shape after the pass: export 711/1550 (avg 2.2), private 471/471
  (1.0), inline 105/162 (1.5), 0 over the limit.

### 2026-08-25 — A region that is a table
`tables:` was opaque. It is modelled now, drawn, and a region can be made a
table from a cell's own menu and taken back apart.

- **The whole entry is read**: `at:`, the `name:` formulas call it, the `style:`
  and the four Table Design toggles, `banded_rows` alone defaulting to on.
- **The region is drawn as Excel bands one**: the header row filled and carrying
  the filter buttons a table brings with it, the stripes `banded_rows` and
  `banded_columns` ask for under it, and an emphasis on the first or last column
  where those are turned on. None of Excel's own palette (ADR-029) — a grey
  wash, and a cell's own fill above it, since a table style sits under direct
  formatting.
- **A table's own rules are refused first**, rather than left to Excel to repair
  the workbook over: a header row that names every column as text, no two of
  those names alike ignoring case, a row under the header, and no overlap with
  another table or with the sheet's own `filter:` — a table carries its own.
- **The name is the one Excel would give**: the first `Table<n>` no table in the
  workbook has, since the name is what formulas reach the table by and a spec
  that leaves it out is harder to read than one that does not.
- **Structured references were already safe.** `moved` and `shifted` copy a
  `[...]` byte for byte and read a word before a `[` as a name, so
  `SUM(Revenue[Revenue])` survives a row being drawn in; each now has a test
  saying so, which is what the roadmap asked for.
- The inspector answers for the table a cell is in, with where it is written.
- Two loader tests used `tables:` as their example of an unmodeled key and now
  use `charts:`, which still is one.
- Comment shape after the pass: export 675/1506 (avg 2.2), private 491/491
  (1.0), inline 105/162 (1.5), 0 over the limit.

### 2026-08-24 — What a cell will accept
`validations:` was opaque. It is modelled now, drawn, and a `list:` can be
written over a selection and taken off again.

- **Every kind is read**: `list:` as the choices themselves or as `{ from: }`
  naming the cells holding them, and `whole` / `decimal` / `text_length` /
  `date` as a comparison. The comparison reader the `conditional:` loader
  already had is now one exported function used by both — `docs/spec.md` §10
  says a validation is spelled exactly as a `cell:` rule, and now it is read
  that way too.
- **A `list:` offers its choices** in a panel under the cell being typed into;
  picking one is the edit. The choices are the **written** values of the cells
  a `from:` names — never a computed one, because a choice picked here becomes a
  value written into a cell (ADR-014).
- **The other kinds wear a quiet corner** and say what they ask on hover, in a
  reader's words — *A whole number between 1 and 1000* — with the spec's own
  `prompt` above it and what a refusal would say below.
- **A cell takes one validation**, so a range that already has one is refused
  rather than given a second: which of the two Excel would ask is not ours to
  pick (ADR-001).
- **A gesture acts on the cell the reader is on.** `spanned()` answers *the
  rectangle of more than one cell*, and reading its `null` as "no rectangle"
  had the filter and the validation write over `A1:A1` whenever the reader had
  a single cell selected. Both take the selection now, a lone cell included, and
  say the range they wrote in the line under the grid.
- **A mark is drawn where it says something.** A validation covers two hundred
  rows; its mark on every empty one of them is noise, so it shows on the cells
  that hold something and on the one the reader is on — which is where a
  dropdown is the way to fill it.
- `parseQualifiedRange` joins `parseQualifiedAddr` in `units`: a `from:` may
  name a sheet or not, and *not* means the sheet it was written on.
- What is already written is read from the **file**, not the projection, as the
  note and the link now are: the projection is redrawn on a delay, and two
  gestures inside one redraw would otherwise write over each other.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-24 — A press is not a drag
*The link did take the reader to the wrong cell, and the reason was the mouse.*
Following a link happens on `mousedown`, and the button is still down when the
sheet it went to is drawn. The browser then sends the cell now under the pointer
an `mouseenter` of its own, and the grid read that — `buttons & 1` — as a drag
of the selection. So the selection landed on whatever cell sat at the screen
position the reader had clicked from: click a link in column B, arrive in column
B, on a sheet you have never seen.

- **A held button is not a drag.** The view holds whether a press is being held
  — taken on the way *down* through the page, so that following a link, which
  runs on the cell's own listener, can say this press is not one. A cell or a
  heading now reports `dragTo` / `dragBand`, the pointer gesture, and the view
  decides whether the selection moves (ADR-047: a listener says what happened;
  it does not say what is selected).
- The same enter arrives after any redraw under a held button, so this was never
  only about links.

### 2026-08-24 — The link a cell carries, and following it
`links:` was opaque. It is modelled now, drawn as a link, followed on
`Cmd`+click, and written from the cell's own menu.

- **Both forms are read**: the bare URL, and `{ url: | to:, tip: }`. A link
  keeps the kind it was written with and its `tip` when its target is changed.
- **Which kind of target it is, is never inferred.** `docs/spec.md` §10 says it
  outright — `Summary!A1` and a URL are both just text — so the menu asks it as
  two entries, *Link to a page…* and *Link to a cell…*, rather than reading the
  answer off what the reader typed. That is ADR-001's rule showing up as UI.
- **`Cmd`+click follows one**: a page opens outside VS Code, a `to:` sends the
  view to that cell on that sheet, through a `goTo` message of its own. Deciding
  which is a pure function in `links.ts`; the panel only does what it says, and
  says where it went — *Went to `Statuses!A1`*, *Opened …* — so a gesture whose
  whole effect is elsewhere is not silent.
- **Going to another sheet clears the selection before it draws.** The cell the
  reader came from belongs to the sheet they left; drawn selected on the sheet
  they arrive at, it is a wrong answer on screen until the selection catches up
  a frame later — which reads as *the link took me to the wrong cell*.
- **Only `http`, `https` and `mailto` open** (**ADR-049**). A spec is a file and
  a file may come from anywhere; a `file:` or a custom scheme handed to
  `openExternal` would be this preview opening a door on the reader's machine.
  The refusal names the schemes it does open.
- **A `to:` that is a defined name is refused**, in as many words: the schema
  allows one, and this preview follows cells.
- The note's box and the link's box are one function now (`askInto`), and the
  view holds one `asking` rather than a state per decoration.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-24 — The note a cell carries
`comments:` was opaque. It is modelled now, from the loader through the compiled
grid to the drawing, and a note can be written, changed, and taken off.

- **Both forms are read**: the bare text, and `{ text:, author: }`. Editing a
  note written the long way changes its `text` and leaves the `author` alone —
  a note always carries one in the file, so there is nothing to lose there.
- **The red corner Excel puts on the cell**, with the note itself on hover, the
  author before it where one is named. A cell that holds nothing but a note is
  drawn for the note. What the cell says on hover is drawn *beside* the cell and
  fixed to the page: `.grid td` clips what is inside it, so the `::after`
  tooltip the rest of the view uses is never seen there — which is why the
  filter mark's own hover text has not been showing either. Both go through the
  one panel now, and a filtered header carrying a note says both.
- **The cell's own menu offers it**: *Insert note* where there is none, *Edit
  note* and *Delete note* where there is one. The note is typed in a box over
  the cell, in the pale yellow Excel shows a note in — a webview has no dialog
  to ask in, and the tab bar's rename already works this way.
- **Which cell already carries a note is read from the file, not the
  projection.** The projection is redrawn on a debounce, so two gestures inside
  one redraw would see a stale grid and write the same address twice — a
  duplicate key rather than a refusal. The sheet's node still comes from the
  grid; everything about the note itself is read out of the CST.
- **The note is in the inspector**, with where it is written — the note's own
  entry, not the cell's.
- The README and §6's gesture table said auto filters and conditional formatting
  were still opaque. Both have been drawn since last week; the rows now say so.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — Refactoring pass after the decorations (`AGENTS.md` §8)
Walked §8's lenses over what Phase 13 has added so far. Findings, and what each
came to:

- **§8.1 Constants.** Nothing new: `KEY` grew `filter` with the gesture that
  writes it, which is the rule working rather than a finding.
- **§8.2 Dead code.** The list of Excel's seventeen icon-set names in the loader
  was exported and used by nobody — written for a validation that was never
  added, and should not be: `yxl build --check` is the validator of record
  (ADR-011), and refusing a name yxl accepts would be a local divergence. Gone.
  A set this view has no marks for already draws no icon.
- **§8.2 Duplicates.** *Is this cell inside this rectangle* had **four** hand-
  rolled copies while `units` exports `within` — in `conditional.ts`,
  `inspect.ts`, `showing.ts`, and one in `keys.ts` that was a **second exported
  function of the same name** with a different signature. One `within` now, and
  `between` where two corners have to become a rectangle first.
- **§8.3 File splitting.** `extension/src/conditional.ts` is 378 lines and does
  three things — decide a rule, measure a range, pick a bar or an icon. **Not
  split**: they are one question asked three ways, all about what a rule makes
  of a cell, and every split would hand the same three arguments across a new
  seam. Recorded rather than done.
- **§8.5 Documentation.** The README still said conditional formatting and auto
  filters were "carried through untouched and drawn as nothing". Both are drawn.
- **§8.6 Comments.** 0 over the limit before and after; the averages did not
  move.
- **§8.7 Layers.** Clean.

### 2026-08-23 — The filter a sheet hangs off its header row
`filter:` was opaque. It is modelled now, drawn, and can be put on and taken off.

- **Every header cell wears the dropdown mark** Excel puts there, and says on
  hover what it is: a filter is declared, and this preview does not filter by
  it. Per-column criteria are not in the schema (`docs/spec.md` §10), so there
  is nothing to filter *by* — drawing the mark is the whole of what is true.
- **The cell's own menu offers it**: *Create a filter* over the selection's top
  row, or *Remove filter*. One per sheet, so a second one replaces the first
  rather than being refused.
- The entry sits last in the menu, under the clipboard, where Excel keeps it.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — Icon sets, and every conditional rule drawn
The last of conditional formatting's kinds, and the end of the construct.

- **The thresholds are yxl's own**, read out of a built workbook: three icons at
  `percent` 0/33/67, four at 0/25/50/75, five at 0/20/40/60/80 — evenly spaced
  positions between the range's low and high, not percentile ranks.
- **The host picks which icon; the view decides what one looks like.** One
  character and a colour for each of the seventeen sets — an arrow, a light, a
  flag, a bar of a rating — enough to recognise and never Excel's own drawing
  (ADR-029). `reverse` turns the set round and `icons_only` hides the value.
- **Every kind of rule is drawn now**, so `decidable` and the inspector's *not
  drawn by this preview yet* had nothing left to say and are gone. What the
  inspector says is what the rule is.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — Colour scales and data bars
The looks that are not a look: two of the three rules that draw an appearance of
their own rather than dressing the cell.

- **Against the thresholds yxl actually writes**, read out of a built workbook
  rather than recalled — `<cfvo type="min"/><cfvo type="percentile" val="50"/>
  <cfvo type="max"/>` for a scale, `min`/`max` for a bar. So a three-colour
  scale turns at the range's **median**, not at the arithmetic middle.
- **A scale is a fill**, so it goes in as one more style layer with the rule as
  its node: the inspector answers for it exactly as it does for a band or a
  style, and nothing new had to learn about colour.
- **A bar is drawn behind the value**, as far along as the value is between the
  low and the high, and `bar_only` hides the value as it says to.
- A cell holding no number gets neither, which is what Excel does with one.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — A conditional rule that is a formula
The third of conditional formatting's four, and the one that needed the engine.

- **`formula:` rules are computed and applied**: one ask per written cell the
  range covers, the formula shifted by that cell's offset from the range's
  corner — the same shared-formula rule the `formulas:` fills already use.
- **The answers come back on a channel of their own.** A condition is asked
  *about* a cell rather than held by one, so it must never land under that
  cell's address: `Evaluation` gained `conditions`, keyed by the rule that asked
  and the cell it was asked about. Nothing evaluated is written either way
  (ADR-014).
- **Only a truthy value matches.** An error, or a formula naming something the
  engine has nothing behind, matches nothing rather than everything — a rule
  that cannot be answered still applies nothing and stops nothing.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — The rules a range decides
The second half of conditional formatting's common case: the rules that cannot
look at one cell and answer.

- **`top`, `bottom`, `duplicate` and `unique` are applied**, worked out once per
  sheet over the addresses the sheet actually writes — a rule's range may be a
  column of a million rows, and only a written cell can hold a value.
- **`top`/`bottom` rank numbers only**, which is what Excel ranks, and every
  cell that ties for the last place comes in with it. A blank counts as nothing,
  for the ranking and for the duplicate count alike.
- **One choice, named as a choice.** Excel's rounding for `{ percent: true }` is
  not in the schema; this takes the floor and never fewer than one. If it turns
  out to differ from Excel, that is a fix and not a surprise.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — Conditional formatting, drawn
Phase 13 opens with the construct a real spec turned out to lean on: a status
column whose colours came from `conditional:` and drew as nothing here.

- **Modelled rather than opaque.** Every kind of rule is read — the eight `cell`
  comparisons, the four `text` tests, `formula`, `top`/`bottom`,
  `duplicate`/`unique`, `color_scale`, `data_bar`, `icon_set` — with its range,
  its `style`/`format`, and `stop_if_true`.
- **The two a cell can be decided by alone are applied in the drawing**: `cell`
  and `text`, over the evaluated value where there is one (ADR-014 — nothing
  evaluated is written), in the order written, which is Excel's priority order.
  A rule that stops the run stops it; a rule this preview cannot decide applies
  nothing and stops nothing.
- **The rest are read, kept, and named.** Every rule whose range reaches the
  selected cell is a line in the inspector saying what decides it, and the ones
  not drawn say *not drawn by this preview yet* rather than being silent.
- The preservation corpus lost a spec from its edit-meets-opaque set, which is
  what modelling a construct does; the floor moved from 7 to 6.
- Comment shape: export 2.2, private 1.0, inline 1.5, 0 over the limit — held.

### 2026-08-23 — Refactoring pass over the whole tree (`AGENTS.md` §8)
Walked §8's lenses in order at the Phase 12 boundary. Findings, and what each
came to:

- **§8.1 Constants.** `KEY` said the keys a writer names "are spelled here and
  nowhere else", and ten of them were bare literals in `intent` — `name`,
  `formulas`, `freeze`, `visibility`, `tab_color`, `gridlines`, `at`, `hidden`,
  `group`. They are in `KEY` now, and the sentence is true again.
- **§8.2 Duplicates.** Three copies of *write this key, or take it out* —
  `freeze.ts`, and two in `sheets.ts` that differed only in which value meant
  "absent". One `keyed` in `direct.ts`, where `null` is the removal.
- **§8.2 Dead ends.** Three exports existed only so a test could reach them:
  `rowAt` and `columnAt` in `window.ts`, `fontOf` in `measure.ts`. All three are
  private now, and the tests go through `wanted` and `widest` — which is where
  the seam already was, since `widest` takes its ruler as an argument.
- **§8.3 File splitting.** `webview/src/index.ts` is 641 lines and one closure
  over eighteen pieces of view state. **Not split**, deliberately: the state is
  genuinely one thing (ADR-047 — the view decides, not a listener), and every
  extraction would mean threading a state object through, which trades one long
  file for a wider seam. Recorded here so the next pass does not rediscover it.
- **§8.5 Documentation.** The README said the toolbar and inserting rows were
  "not [in], and are the next three phases", which shipped in Phases 9–11, and
  pointed at Phase 12 for charts, which is Phase 14. Both corrected. **Phase 13
  reordered**: `conditional:` and `filter:` go first, because a real spec
  (`torchrelay-docs`) uses both and a reader asked after them.
- **§8.6 Comments.** Nine blocks over §8.6's shape limit, now **zero**. Three
  export docs cut to what the API is plus one pointer; six private docs cut to
  one line. Nothing was deleted that the code could not already say.
- **§8.7 Layers.** Clean: the checker passes and nothing imports upward.
- Comment shape after the pass: export 2.2, private **1.0**, inline 1.5, **0**
  over the limit — down from 9, which is the number to hold to next time.

### 2026-08-23 — A frozen row stays the height it is drawn at
Scrolling a sheet with `freeze:` squashed the frozen rows: three rows of a
header stacked into one band, their text overlapping.

A frozen row is `position: sticky`, and each was pinned at the height the spec
*declares* for the rows above it. A row is only ever at least its declared
height — the browser grows it where the text wraps or the font is larger — so
the pins were all too high, and each row sat on top of the one before.

They are pinned by what they measure now, once the grid is in the page, and left
as declared where there is no layout to measure at all: a panel not yet shown
has only the declaration, and the declaration beats zero.

### 2026-08-23 — Text spills, as it does in both spreadsheets
A heading typed into `A1` runs across `B1` and `C1` in Excel and in Sheets, so
long as those cells are empty. Here it was clipped at the cell's own edge, which
made a real sheet look like it had lost its title.

- **A cell's text may run over the empty cells to its right**, and clips where
  the first cell that shows anything begins. The cell keeps its own width; only
  the text runs.
- **It does not run where a spreadsheet would not let it**: where the cell wraps
  (that is what wrapping is for), where the text is not left-aligned (Excel runs
  right-aligned text the other way, which is a later item), where the text holds
  a line break, or where the cell is merged and already spans.
- **It runs over a frozen row too**, which took a second pass: a frozen row's
  cells are `position: sticky` and carry a white ground of their own, so the
  cell after the spilling one painted over the text. The spilling cell is lifted
  one step above its row-mates, and the text a step above its own cell.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — A colour written `00RRGGBB` is not invisible
A real spec drew a sheet of blank cells: every value laid out, every row the
right height, and not one character on the screen.

Its styles spell every colour `AARRGGBB` with a `00` alpha — `'00303AB2'` — which
is what yxl writes into the workbook and what Excel reads as **opaque**: Excel
ignores the alpha byte of a `<color rgb>`. The view moved that byte to the end
for CSS, which reads `#303AB200` as **fully transparent**. The one existing test
used `FF00FF00`, whose alpha happens to be opaque either way.

So the view drops the alpha rather than moving it, which is what Excel does.
`painted` in `units` is the one answer to "how does a screen paint this colour",
and the three places that each had their own — a cell's text and fill, the
toolbar's swatch and picker, a tab's colour — now ask it.

### 2026-08-23 — The splitter, drawn — Phase 12 complete
The last of `docs/spec.md` §2's sheet keys, and the last item in the phase.

- **`split: { x, y }` is drawn where it says**: Excel's grey bar, on each axis
  the sheet splits, at the points the spec gives converted to pixels (a point is
  four thirds of a CSS pixel). An axis at `0` draws nothing, which is what `0`
  means.
- **Read-only, and said under the grid.** The panes do not scroll apart and the
  bar does not move; a preview that let it be dragged would be writing a key it
  cannot place to the pixel. That is said as a note under the grid, beside the
  other notes, rather than as a tooltip on the bar: a three-pixel line running
  the height of a scrolling sheet has nowhere to hang one, and it should not eat
  the clicks of the cells it crosses to try.
- **The freeze gesture reads the modelled `split`** rather than the CST key it
  stood in for while `split` was opaque. Same refusal, one source.
- **Phase 12 is complete.** The tab bar adds, renames, deletes, reorders, hides,
  colours and switches gridlines, and every key §2 names is modelled rather than
  carried through blind.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — Gridlines, off
The third of the tab's switches, and the smallest.

- **`gridlines: false` is drawn as off**: the sheet's own lines go, and a cell's
  own borders stay, which is the distinction `docs/spec.md` §2 draws.
- **A switch in the tab's menu**, ticked where the lines are on. Turning them
  back on takes the key out rather than writing `gridlines: true` — the spec
  says the same thing with one fewer line, and this editor does not add a key to
  say what the default already says.
- Menu entries can carry a tick now, which is what a switch in a menu needs and
  what the coming `split:` row will use.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — The tab's own two keys
`visibility:` and `tab_color:` were opaque — preserved and invisible. They are
modelled now, and the tab's menu sets both.

- **Hide and unhide** from the tab's menu. Excel takes a hidden tab away
  entirely; this draws it faded and italic instead, because a preview that hides
  it leaves the reader no way to bring it back. Hiding the last sheet that shows
  is refused — yxl refuses a workbook where every sheet is hidden.
- **`very_hidden` is drawn as what it is and not offered.** Excel undoes it only
  from VBA, so every entry on that tab's menu is disabled rather than writing a
  key this editor cannot honestly undo.
- **A tab colour** from the same menu, over the palette the toolbar already had:
  the swatch grid and the reader's own colour moved into `menus.ts`, so there is
  one palette in this view rather than two.
- **The deletion's `visibility:` guess is a real check now.** It refused when
  every other sheet merely *had* a `visibility:` key, since it could not read
  the value; it reads it.
- Also here: the extension-level test for the tab reorder that the last pass
  meant to land and did not — the edit that was supposed to add it failed
  silently, and the suite was green because nothing was there to fail.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — The tabs, dragged into order
The tab bar's fourth gesture, and the last of `sheets:` itself.

- **Drag a tab along the bar** to move the sheet, which is the order of
  `sheets:` (`docs/spec.md` §2). The tab a dragged one would land on takes a
  border; dropping on it puts the sheet at that place.
- **One `write` over the whole sequence.** Every entry keeps its own bytes and
  its own comments; only the order changes, and the blank lines between the
  entries stay where they are rather than travelling with a sheet. The edit
  claims `nothingChanges`, which is true: no cell moves, so `verify` refuses
  anything that does.
- **Why not remove-and-insert.** A sequence's paths are indices, and the inverse
  of a patch is read against the tree as it was (ADR-026); a removal shifts
  every index after it, so the undo of the pair would have pointed at the wrong
  item. `reordered` in `cst` writes the sequence instead, and its inverse is the
  text it replaced.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — A range reaches as far as what it reads
A `formulas:` range is meant to be written past the data (`docs/spec.md` §3:
`at: D2:D500` over twenty rows is the point of the construct), so the preview
computes it only as far down as there is anything to read — otherwise a wall of
zeros. It measured that against the rows of *the sheet the range sits on*, so a
range reading another sheet stopped at its own last row and drew its formula
instead of a value from there down.

It now measures against the last row of every sheet the formula names, which is
`names` over the one formula parser again. A range reading only its own sheet
stops exactly where it did. Comment shape held at 9 over the limit.

### 2026-08-23 — A sheet taken out
The tab bar's third gesture, and the first deletion in this project that has to
reason about what else the file says.

- **Delete from the tab's own menu.** The sheet's entry goes, and so do the
  `overrides:` on its cells — yxl refuses an override naming a sheet that is not
  declared, so leaving them would write a spec that no longer builds. Where they
  were the only overrides, the `overrides:` key goes with them.
- **Three refusals, each with the reason.** The only sheet (`a workbook needs a
  sheet`); a surviving formula that names it, listed by cell — Excel writes
  `#REF!` there and this writes nothing; and every other sheet setting
  `visibility:`, which this preview does not read yet and so cannot show that
  one would be left visible.
- **`names`, a fourth rule over the one formula parser**, and `cellsNaming` in
  `intent` over it: every cell on the other sheets whose formula names this one.
  The rename claims that set as what it changes; the deletion refuses over it.
- **A last entry takes the gap above it.** A removal already took the comment
  block above an entry and the blank line under it; a *last* entry has no gap
  under it, and the blank line above it was left orphaned — so the removal was
  refused, since it could not be put back byte for byte (ADR-026). It now takes
  that gap, which is every real file with a blank line between its sheets.
- Comment shape: export 2.2, private 1.0, inline 1.5, 9 over the limit — held.

### 2026-08-23 — A sheet renamed, and everything that named it
The tab bar's second gesture, and the first edit in this project that rewrites
formulas the reader never looked at.

- **Double-click a tab to rename it**, or pick *Rename* from the tab's own
  right-click menu, which is where a spreadsheet keeps what there is no room for
  on the tab. The tab itself becomes the box the new name is typed in — Enter
  takes it, Escape leaves it, clicking away takes it — since a webview has no
  dialog to ask in. The same name back asks for nothing.
- **The two clicks are counted in the view**, not left to `dblclick`: going to a
  sheet redraws the tab bar, so the second click lands on an element the first
  never saw and the event never arrives (ADR-047 again, from the other side).
  The box itself is drawn from view state for the same reason.
- **One edit, everywhere the name is written**: the sheet's `name:`, every
  inline cell formula, every `formulas:` range body, every `defs.formulas` body,
  and every override's `at:`. Split across files it is refused rather than half
  done.
- **`renamed`, the third rule over one formula parser.** `units/formula.ts` now
  carries `moved` (a shared formula translated), `shifted` (rows and columns
  inserted or deleted) and `renamed` over the same walk: it rewrites only the
  word before a `!`, quotes the new name where Excel's grammar needs it
  (`'Q3 data'!A1`), doubles an apostrophe inside one, and leaves a sheet name
  that appears inside a string literal alone.
- **The edit claims exactly the cells whose formula it rewrites**, so `verify`'s
  double-compile diff still catches anything else that moved (ADR-009).
- Comment shape after the pass: export 2.2, private 1.0, inline 1.5, 9 over the
  limit — held.

### 2026-08-23 — A new sheet
Phase 12 opens: the first thing a spreadsheet user does with the tab bar that
this one could not do.

- **A `+` on the tab bar**, and the bar shown even for one sheet so there is
  somewhere to press. The sheet is added at once under the next free name —
  `Sheet2`, `Sheet3`, … past the ones there are — as both spreadsheets do, and
  shown as soon as the drawing that has it arrives. Renaming is the next item.
  (The first cut asked for the name with `window.prompt`, which a webview does
  not have: the `+` did nothing in the running preview.)
- **One `- name:` entry, last**, which is tab order (`docs/spec.md` §2). Holding
  nothing yet; the first thing typed into it makes its `cells:`.
- **Excel's own name rules at the writing edge.** yxl refuses a spec over a bad
  sheet name, so a name it would refuse is refused here first — by the rule it
  breaks, not by a generic "cannot". A name *read* from a file stays the
  compiler's to judge (ADR-011); the rule is for what is about to be written.
- **`verify` can be told about a sheet.** An edit's claim was cells only, so a
  new sheet was a surprise the reader had to wave through; `Expects.sheets` is
  the claim, and every other Phase 12 item will make it.
- 1885 → 1898 tests.

### 2026-08-23 — What the project is for, said again
A tidy of this document and a pass over the tree, between Phase 11 and what
comes next.

- **Two phases taken out.** The assistant (was Phase 14) and the shells beyond VS
  Code (was Phase 15) are gone from the plan, not deferred: a VS Code extension
  is a poor home for an assistant, and another shell is another project. §1 now
  says in one sentence what this one is — *everything `docs/spec.md` can say,
  reached the way a spreadsheet user would reach for it* — and the L5 layer, the
  Tauri clause in principle 8 and §4.2, and §8 Q8 went with them.
- **The schema is the measure, and it was not being measured.** The sheet keys a
  spreadsheet user meets on an ordinary day — `filter:`, `comments:`, `links:`,
  `validations:`, `conditional:`, `tables:`, and the sheet's own `visibility`,
  `tab_color`, `gridlines` — were all opaque and none was on any phase's list.
  They are now: **Phase 12** is the sheets themselves (add, rename, delete,
  reorder, hide, colour — today the tabs only switch), **Phase 13** is what
  decorates a cell (§10, §11), **Phase 14** is what sits on the sheet (was 12),
  **Phase 15** is the rest of the schema said honestly, and the deterministic
  refactors are **Phase 16** and marked lowest — spec hygiene, not a gesture.
  The gesture table has eight new rows for all of that.
- **The code:** the five Phase 11 modules each spelled a rectangle as `A1:B2`
  and walked one into addresses for themselves. `rangeOf`, `addressesOf` and
  `overlapping` are `units`' now, beside `rectOf`, which they are the way back
  from. 1881 → 1885 tests.

### 2026-08-23 — Rows in order, and Phase 11 with them
The last item of the phase: sorting a `data:` block.

- **Sort A to Z / Sort Z to A** in the cell's own menu, over the rows selected
  and by the column the selection starts in. The **row moves whole**; the column
  only says which key, which is what a reader who selected one column means.
- **Each row is written where it goes as the file wrote it** — the source text,
  not the values re-rendered — so a sort changes the order of the lines and
  nothing whatever about any of them. A `"007"` is still `"007"` afterwards.
- **The rows outside the selection do not move**, so a header row stays a header
  row by not being selected, which is the only rule that needs no guessing.
- **Numbers, then text, then nothing**, as a column orders in Excel.
- **Refused with its reason** where the rows are not a table written here, where
  they are in that order already, and where they are written a line at a time —
  which the CST does not reorder yet.
- 1867 → 1881 tests, one of them Tier 4: the quickstart's three quarters put in
  order largest-first, its header left where it is, through the pinned compiler.
- **Phase 11 is done.**

### 2026-08-23 — Fill down, fill right
Phase 11's fifth item, and the one §8 Q2 was blocking until ADR-031 answered it.

- **`Cmd`+`D` and `Cmd`+`R`**, and *Fill down* / *Fill right* in the cell's own
  menu, over the rectangle selected — the first line is the source, as it is in
  both spreadsheets.
- **Two answers, and the reader picks.** One `formulas:` range, which is what
  Excel's own fill makes of a formula and what a spec says in a line; or a cell
  each with the references moved per row (ADR-031). Which one a spec wants is
  the reader's judgement, not ours (ADR-001).
- **The range is not offered where it would be wrong**: a line of values has no
  formula for one to hold, and a run with something already written under it
  cannot take one — a range may not cross a cell the sheet writes
  (`docs/spec.md` §3).
- **A cell each goes through the landing machinery** the clipboard already uses,
  so a cell that cannot take what is coming refuses the whole fill and says
  which — the same rule a paste follows.
- **No drag handle.** The keys and the menu are the gesture; a handle is a
  second way to ask the same question, and it can wait for a reader to ask for
  it.
- 1854 → 1867 tests.

### 2026-08-23 — A row onto the table beside it
§4.4's `empty` ②, and the last thing Phase 7 left half-built.

- **Typing under a table offers to put the row in it**, beside the answer that
  writes a `cells:` entry. Which one the reader takes is the judgement §8 Q1 is
  about — a hundred keyed cells, or one anchor — and it is theirs to make, so it
  is asked rather than decided (ADR-001).
- **The row goes in with nothing in the fields before it**: typing `3` into `B4`
  under a block anchored at `A2` writes `- [null, 3]`, which is the block's own
  way of saying a field it does not fill.
- **Only where the block is written here**, since a block that reads a CSV keeps
  its rows in the file, and **only for a value** — `values:` has nowhere to keep
  a formula, so a typed `=…` gets the one answer it always had.
- **The question was already there.** The `newCell` answer has not been `alone`
  beside a block since Phase 7, so a reader has been asked a question with one
  answer in it all this time. It has the second one now.
- 1849 → 1854 tests.

### 2026-08-23 — Keep this as a table
The answer §8 Q1 promised: where a spec's addresses have become the thing that
moves, the format already has somewhere better to put them.

- **Make this a data table**, in the cell's own menu, over the rectangle
  selected: the `cells:` entries go, and one anchored `data:` block takes their
  place. Inserting a row under it is a one-line diff from then on.
- **Each field is taken as the file wrote it**, not as the value it compiled to.
  A quoted `"007"` is still text on the other side; that is the difference
  between rewriting a spec and re-typing it.
- **A cell that says more than a value is refused by name.** A table has nowhere
  to keep a look (`docs/spec.md` §9), so the gesture says which cell and stops
  rather than dropping it.
- **The line question points at it** where the count it is showing is `cells:`
  keys — which is what §4.4 asked for: show the diff a row insertion would make,
  and say what the format offers instead.
- **A gap is `null`**, the block's own word for a cell it does not fill, and the
  `cells:` key goes when the table takes every entry that was under it.
- 1837 → 1849 tests, one of them Tier 4: four cells of the quickstart become a
  table, and the workbook the pinned compiler builds is unchanged — including
  `SUM(B2:B3)`, which still finds them.

### 2026-08-23 — Merge, and take apart again
Phase 11's third item.

- **Merge cells / Unmerge cells** in a cell's own menu, over the rectangle the
  reader has selected — *merge* where it is more than one cell and nothing there
  is merged, *unmerge* where the cell is inside one.
- **Merging is lossless.** Excel throws away every value but the top-left; a
  spec keeps them, because a merge only *draws* over them (`docs/spec.md` §2).
  So the gesture is its own inverse: merge and unmerge gives the sheet back
  exactly, and the workbook shows what Excel would show either way.
- **Refused where it would cross a merge already there**, naming it. yxl passes
  overlapping merges through and it is Excel that would complain about the
  workbook, so the editor is the place to stop it.
- **The key is written the way the spec writes it** — `merges: [A1:C1]`, one
  line — and goes when the last merge in it does.
- **Band creation** was already done, by the gestures that need one: a look or a
  size over a whole column writes a band of its own (ADR-041, ADR-042).
- 1825 → 1837 tests, one of them Tier 4: the merge goes through the pinned
  compiler and `B1` is still `Revenue` under it.

### 2026-08-23 — A field into a row written as `[a, b]`
The limit the last change wrote down, lifted — and the first Phase 11 item
closed with it.

- **A field goes into a flow row at a point**, not by rewriting the row: the
  edit is a zero-width insertion before the field it displaces, so **several go
  in at once** and every other edit to that line stays disjoint. Inserting two
  columns through a four-hundred-row block is eight hundred edits that never
  touch each other.
- **Taking one out narrowed the same way**, so a removal claims its own field
  and the one separator beside it rather than rewriting the brackets.
- **What is still refused, and why:** *two* fields out of one row at once. Each
  would claim the comma between them, and no rule makes both disjoint — so the
  gesture says to take them away one at a time rather than refusing at the
  splice with an internal message.
- **`rekeyMap` is given back.** §4.5 had been holding a place for an op to do
  the bulk A1 shift; there is nothing for it to do that four hundred
  `renameKey`s do not already do disjointly.
- 1820 → 1825 tests, and a column inserted into the reader's own sample: every
  data row gains a blank field, `1月` moves from `B2` to `C2`, and the totals
  range reads `O3:O402`.

### 2026-08-23 — Insert and delete, from the heading
Phase 11's first item, finished: the gesture a reader reaches for on a row
number.

- **Insert N rows above / below, and Delete N rows**, on the row numbers and the
  column letters both, over the run the reader has selected — three rows
  selected inserts three, as it does in both spreadsheets.
- **The count is in front of it where it is more than a handful.** Over twenty
  things and the edit is *offered* rather than taken, saying what it moves and
  how much of that is `cells:` keys. That is §4.4's diff-size preview, and where
  the keys are the cost, the number is the case the `data:` conversion will be
  made from.
- **Through the whole write path**, so every one of them lands through `verify`:
  a structural edit is checked against the grid it leaves, and claims both ends
  of every move — the cell that emptied and the one that filled.
- **Proved at Tier 4**: a row put into yxl's own quickstart, built by the pinned
  compiler, comes back with `EMEA` a row down, `SUM(B2:B3)` reading
  `SUM(B2:B4)`, the `data:` block at `A10`, and the filled `C4` applying
  `B4*0.05`.
- **A row's own total does not stand in its way.** Every row of a table totals
  itself, so deleting one was refused by the formula that goes *with* it. A cell
  the line takes away is not asked to survive it — which is Excel's rule, and the
  reason `#REF!` never comes up there either.
- **A refusal keeps its reason.** The one answer is offered whatever the intent
  turns out to be, so a reader is told what stood in the way rather than
  `nothing here moves`, which is what the flow says when there is no answer at
  all.
- 1813 → 1820 tests.

### 2026-08-23 — A line drawn in the sheet
Phase 11's third piece: the write. Every construct the line reaches, moved where
the line leaves it.

- **A `cells:` key is renamed and its formula rewritten** — and a formula is
  rewritten *wherever it stands*, not only where the line moved the cell it is
  written in. `=A5*2` in `B1` says `=A6*2` once a row goes in above 5.
- **A `data:` block opens a gap or moves by its anchor**, a `formulas:` range
  and a merge take the line in or move whole, a band's `at:` follows, and the
  freeze moves with the cell it names.
- **`rekeyMap` is not needed.** §4.5 has been holding a place for an op that
  does a bulk A1 shift; ops are located against the tree *as it was* and spliced
  at the end, so four hundred `renameKey`s are four hundred disjoint edits with
  no collision to sequence. The language does not have to grow.
- **A filled cell is checked too.** Deleting row 5 under a range whose cell at
  `C8` applies `=A5*2` is refused, naming that cell — Excel would leave `#REF!`
  there.
- **What it will not do, and says so:** put a field into rows written as
  `[a, b]`, which needs the CST to rewrite a flow sequence. Rows written a line
  at a time take one either way.
- 1797 → 1813 tests.

### 2026-08-23 — What a line would move
Phase 11's second piece: the answer to *what happens if I insert a row here*,
worked out before anything is written.

- **Every construct the line reaches, and what becomes of it**: a `cells:` entry
  shifts or goes, a `data:` block or a `formulas:` range or a merge or a band
  **grows** where the line falls inside it and **shifts** where it falls above,
  and the freeze moves with the cell it names. The same four verbs for all of
  them, on both axes, for an insert and for a delete.
- **One entry per line of YAML the edit would touch.** That is the number §4.4
  says to show a reader before they decide — and where the entries are mostly
  `cells:` keys, the count *is* the case for offering the `data:` conversion
  instead (§8 Q1).
- **What stands in the way is enumerated too**, not discovered halfway: a
  formula that names a row a delete would take (from `shifted`), and rows that
  come from a CSV, which this cannot open a gap in. A line with anything in its
  way is not drawn at all.
- 1784 → 1797 tests.

### 2026-08-23 — What a reference does when a row is inserted
Phase 11's first piece, and the one everything structural stands on.

- **`shifted`, beside `moved`, over one parser.** A shared formula and an
  inserted row move references by *different rules*: the first leaves a
  `$`-anchored half alone, the second moves it, because the cell it names has
  moved. The parsing — quotes, brackets, `A:A`, Excel's limits, what is a word
  and what is a name — is the same walk with the rule handed to it.
- **It knows whose sheet the line is in.** `Sales!A5` in a formula on `Notes`
  moves when the row goes into `Sales` and not otherwise; a bare `A5` moves only
  where the formula is on the sheet the line is in. A quoted `'Q3 data'!A1`
  reads as the sheet it names.
- **A reference into what a delete takes away is refused**, and says which one:
  `` `A5` names a row this would take away ``. Excel writes `#REF!`; a spec is
  read by people, and a file that says `#REF!` is one nobody can fix from
  (**§8 Q1**).
- **Q1 is answered**, which Phase 11 was waiting on: no anchor-relative
  addressing upstream. `cells:` is keyed by address because that is what makes
  it readable alone; the format's answer for the case that hurts is a table.
- 1772 → 1784 tests.

### 2026-08-23 — Said once, again
A pass over the tree before Phase 11 proper. Less to find than last time, which
is the point of doing it every phase; what there was, was mostly things the last
few fixes had each said for themselves.

- **`ANYWAY` was written twice.** The `anyway:<id>` convention — how a reader
  confirms an edit the checker was surprised by — had a regex in `write.ts` and
  an identical one in `asked.ts`, a fortnight apart in age and one character
  from silently disagreeing. One export now.
- **The sheet-name guard was written eight times**, message and all. It is one
  function: the sheet a gesture named, or `null` once the reader has been told
  it is not a name.
- **`cellOf(showing)` was byte-identical** in `boxes.ts` and `showing.ts`, the
  second a leftover from the pass that moved it.
- **`many()` was written three times** over three payloads with the same three
  fields, and is one function beside the flow that uses it.
- **Schema key names are the schema's**, not the writer's: `'cells'`,
  `'overrides'`, `'style'` and `'format'` were named again in `intent` and now
  come from `spec`, which is where the schema's keys are spelled.
- **`webview/index.ts` (534 lines) was looked at again and left alone.** Its
  state is genuinely shared between the gestures and the message handler, so
  every split is arbitrary; noted rather than cut, for the third time.
- 1770 → 1772 tests, and 27 fewer lines. Comment shape unchanged at 9 over the
  limit.

### 2026-08-23 — One `cells:` key, however many entries
The last of what the data-block work left, and not what the note said it was.

- **The note guessed, and guessed wrong.** A rectangle over several data-filled
  cells was already one answer and one sentence. What was broken sat underneath:
  each cell asked for the `cells:` mapping to be *made*, so a sheet that had none
  got the key three times and the checker refused the patch outright —
  `` `cells` is written twice; the first one wins ``. Nothing was written, and
  the reader saw a message about the shape of their file rather than their edit.
- **A sheet has one `cells:` key** however many entries go under it. The ops that
  would each make it are folded into the first, which is the only one that has
  to make anything.
- **A note written from a guess is a note that has to be checked before it is
  believed.** This one cost a reproduction to find out, and the reproduction is
  now the test.
- 1769 → 1770 tests.

### 2026-08-23 — A look inside a filled range
The other half of the last change: the cells a `formulas:` range fills, where a
`cells:` entry may not go at all.

- **Two answers, asked rather than picked.** An `overrides:` entry on that one
  cell — which §23 calls *the* answer inside a filled range and ADR-007 already
  designates here — or a band over the run, which is what §3 recommends for
  styling a region. The band is over the axis the **range** runs, since that is
  the one that reaches every cell it fills.
- **An override says only the facets it is about.** `lines()` wrote a `value:`
  whatever it was given; a look asked for now writes `style:` and no value, as
  §23's facet independence intends.
- **At the range's top-left there is only the run.** That is where the shared
  formula is stored, so §23 refuses an override there, and offering one would
  have been offering a refusal.
- **One spec type through the intent layer.** `Projection { grid }` and
  `Excepting { doc, grid }` were two names for what a write needs; they are one
  now, which is what let a *look* reach the override path at all. Every caller
  in the extension passes its `Spec` straight through.
- **A band names what a range fills.** The cells a `formulas:` range covers are
  worked out on demand, not held in the sheet's map, so a look over the column
  named none of them and the checker called all four hundred a surprise. Which
  addresses a sheet holds a cell at is a question `compile` owns and `verify`
  already answered for itself; it answers it once now, and `intent` asks the
  same question.
- **Any gesture can be confirmed, not just a typed edit.** *Apply it anyway* was
  offered only where the refusal carried what the reader typed, so a look that
  surprised the checker was a sentence with no way past it. The message a
  refusal carries is the way back for every gesture now (ADR-048), and the
  shared flow reads `anyway:` the way the typed path always has.
- 1764 → 1769 tests, one of them Tier 4: the exception goes through the real
  compiler and the cell comes back bold with its formula still filling it.

### 2026-08-23 — A look on a cell a data block fills
Reported from the running preview: bolding a row that a `data:` block writes did
nothing. Two bugs stood behind it, and the compiler settled both.

- **The look was being written into the data entry**, which the schema has no
  key for — *"formatting is not part of a data block"* (`docs/spec.md` §9). The
  loader caught it and the edit was refused, so nothing invalid was ever
  written; the reader just got a schema error where an answer belonged.
- **It goes in a `cells:` entry of its own now**, which is what the format
  supports: asked of the real compiler, a style-only entry over a data block
  passes `--check`, applies the look, and **leaves the value where the block
  writes it** — whichever key comes first.
- **Our own projection disagreed with that**, which is the part worth keeping:
  a later construct replaced the *whole* cell, so the preview showed the value
  vanishing where the workbook kept it. yxl merges **one facet at a time** —
  what a cell holds, its format, its look — and each is the last construct that
  spoke of it. That rule already existed here for `overrides:`; it is now the
  one rule every construct goes through, and an override's `format: null` clears
  the format the way the compiler does.
- **A cell a `formulas:` range fills is still refused**, and correctly: a
  `cells:` entry may not overlap a range at all (`docs/spec.md` §3), so there is
  nowhere on the cell to put a look. The band or an override is the answer, and
  neither is offered yet — the item below.
- **A second look goes into the entry the first one made.** The cell's value
  provenance stays the block's however many looks it wears, so the second took
  the same path as the first and asked for a `cells:` entry at an address that
  now had one. Which entry to write into is a question the style layers already
  answer: a layer records the construct it came through.
- 1757 → 1764 tests, one of them Tier 4: the look goes through the real compiler
  into the workbook, with the value still beside it.
### 2026-08-23 — One answer, one path
A refactoring pass over the whole tree before Phase 11, asked for after the
third report of one bug wearing three faces. The theme is the one the reader
named: **stop growing a branch where the shape is already the same.**

- **A refusal carries the message it was about** (**ADR-048**). Sixteen message
  kinds became eight, eight `Asks` methods became one, and the `if` chain that
  turned a refusal back into a gesture became `{ ...about, choice }`.
- **The four §4.4 gestures are one function and four vocabularies.** A look, a
  size, hiding and grouping were the same forty lines four times; `asked.ts` is
  that algorithm once, and each gesture now says only what it is called, what
  answers it, and the four sentences a reader hears.
- **`spanSaid` lived in two packages** — byte-identical in the host and in the
  view. It is `units`' now, with `Axis` beside it: which way a band runs is a
  fact about a grid, not about the schema, and `spec` re-exports the name so
  nothing above it had to move.
- **The shortcut spelling had two definitions** a fortnight apart in age and one
  character apart in behaviour. One `HELD`, in `keys.ts`.
- **The last listener that read the selection now asks the view.** `Cmd`+`F` in
  a cell passed the search text as the *grid was drawn with it*, so a search
  opened after typing in the box reopened on the old text (ADR-047).
- 1751 → 1754 tests, and 119 fewer lines of source (404 deleted against 285 written,
  most of the new lines being the tests and the ADR). Comment shape unchanged at 9 over the
  limit.

### 2026-08-23 — A right-click menu on a cell
Phase 10's last item, and the phase with it.

- **Cut, copy, paste and clear contents**, at the pointer, each with the key
  that does it written on the right as both spreadsheets write it.
- **The selection stands where the right button lands inside it**, and is taken
  where it lands outside — which is what a reader who selected a rectangle and
  reached for the menu meant. **Where that is decided matters** (**ADR-047**): a
  listener on a cell was built when the grid was last drawn and cannot know
  where the reader has got to, so it reports the gesture and the view answers
  what it is about.
- **Paste is the browser's to give.** It hands the clipboard to the keyboard and
  to nothing else, so the entry acts on what was copied inside the preview and,
  where there is none, says to press the key instead. Cut and copy have no such
  trouble: they write in the gesture that asked.
- **`pointing.ts` is now where a menu at the pointer is built**, both the
  heading's and the cell's; `draw.ts` went back to being the page.
- 1741 → 1751 tests.

### 2026-08-23 — A look taken all the way off
The item the last change left behind, which turned out to be one line of
measurement in the wrong place.

- **A cell that wore a declaration and now wears nothing says nothing.**
  `A1: { value: 1, style: header }` cleared is `A1: 1`, where it used to be
  `A1: { value: 1, style: { font: { bold: null } } }` — the name gone and a
  mapping of nulls standing in for it, overriding a declaration that was no
  longer named.
- **Why it happened.** What a cell must say was measured against the
  declaration it *currently* names, on the assumption that the name survives.
  `normalize` is what decides that, and it had already decided otherwise. The
  measurement is now taken with no declaration kept; the declaration is still
  offered to `normalize` as a base, so nothing about the compact answer changes.
- **Taking one property off is the same fix.** A cell wearing a declaration that
  gives only that property loses the name too; one wearing a declaration that
  gives more keeps it, as `{ extends: header, font: { bold: null } }`.
- 1739 → 1741 tests.

### 2026-08-23 — The rest of the bar
Phase 10's eleventh item: what a reader reaches for and did not find.

- **The font face and size**, which `docs/spec.md` §6 has had all along and the
  bar did not offer. The face is a **list rather than the machine's fonts** — a
  spec is read on machines other than this one, so what it may name is what
  Excel will go looking for. Whatever the cells already wear is kept and shown
  alongside, so opening the box never loses a face this list has not heard of.
- **Percent, and a decimal place more or fewer**, the quick formats Sheets keeps
  beside its box. The decimals are arithmetic on the format code — `¥#,##0`
  gains a place as `¥#,##0.00`, `0.0%` loses one as `0%`, and both halves of
  `#,##0.00;[Red]-#,##0.00` move together, as Excel moves them. A point inside
  quotes is text and is left alone.
- **Currency is in the box, not a button.** The symbol is a choice; a button
  would have to make it for the reader, and this project does not do that
  (ADR-001). `¥#,##0` and `$#,##0.00` are two more entries in the list.
- **Clear formatting**, which is one `setStyle` over every property the schema
  has. On a cell carrying its own look the file goes back to exactly what it was
  before any of it went on — `A1: { value: 1, style: … }` becomes `A1: 1`.
- **Three modules where there was one.** `toolbar.ts` kept the bar; the fonts
  and the number formats went to their own files, and the three helpers that say
  what is selected and what it wears went to `showing.ts`, which is where that
  question already lives.
- 1709 → 1739 tests. Comment shape unchanged at 9 over the limit.

### 2026-08-23 — The keys a look has
Phase 10's tenth item: `Cmd`/`Ctrl`+`B`, `I` and `U`.

- **The keyboard puts a look on**, over whatever is selected — a cell, a reach,
  a whole column taken from its heading — and takes it off again where it is
  already worn.
- **The key presses the button.** The toolbar is rebuilt on every restate, so it
  is the thing that already knows the rectangle and what that rectangle wears;
  the shortcut finds the switch and clicks it, and so cannot drift from it.
- **The shortcut is written on the button**, `⌘B` or `Ctrl+B` as the reader's
  own keyboard has it.
- **A box of text keeps its own keys.** The guard that held `Cmd`+`A` back from
  the grid only knew about `<input>`, and had let it through since the cell
  editor became a `<textarea>`.
- **A heading click keeps the keyboard on the grid.** Nothing in a heading could
  hold it, so the browser put it on the page, and every key the page answers —
  these three and `Cmd`+`A` — was lost until a cell was clicked. The heading
  takes it, and hands it on to the cell the selection starts at where the grid
  is drawing that cell.
- **The tooltip is the view's own now** (**ADR-046**). A webview never shows the
  browser's `title`, so no toolbar control has ever named itself in the running
  preview — including the disabled ones, which is when a reader most wants to
  know. Every control in the bar carries its name and the stylesheet draws the
  bubble.
- **VS Code no longer answers the shortcut as well.** A webview forwards its keys
  whatever the view does with them, so `Cmd`+`B` was closing the side bar behind
  the preview. The three are bound to a command that does nothing while the
  preview is the active panel.
- 1699 → 1709 tests.

### 2026-08-23 — What the selection comes to
Phase 10's ninth item, and the third thing the host answers because the view can
only see a window.

- **Select a rectangle and the count, sum and average are said under the grid**,
  quietly and on the right, where every spreadsheet says them. One cell says
  nothing, which is what a spreadsheet does too.
- **The host computes it**, for the reason `find` (Phase 8) and the fit
  (ADR-043) are answered there: the view is drawn a window, and a whole-column
  selection reaches past it (ADR-019) — a sum taken in the view would be the sum
  of what happened to be drawn.
- **It adds what a formula came to**, not the formula: the number a reader sees
  is the number they expect to be added. That is display reading display, and it
  reaches no write path (ADR-014).
- **Count is what holds anything**, sum and average what is a number among it —
  Excel's own division, and the reason a column of names says `Count 12` and
  nothing else.
- 1690 → 1699 tests.

### 2026-08-22 — A line break inside a cell, and the keys that leave it
The everyday half of the editor, brought to what a reader of Sheets already
does with their hands.

- **`Alt`+`Enter` — or `Cmd`/`Ctrl`+`Enter` — puts a line break in the cell**
  rather than committing it, and `Enter` commits the whole of it. The box a cell
  is typed into is a `textarea` now, grown to what is in it, so two lines are
  two lines while they are being typed.
- **The formula bar had to become one too, and that was a quiet bug.** An
  `input` strips line breaks out of its own value, so a cell holding two lines
  showed as one there — and pressing `Enter` in the bar would have written the
  one back over the two.
- **The keys that leave a cell are the ones both spreadsheets use**: `Enter`
  down, `Shift`+`Enter` up, `Tab` right, `Shift`+`Tab` left. `Tab` used to blur
  the box, which abandoned what was typed.
- **A value with a break in it is drawn with the break**, wrapped or not: the
  break is what the spec says, and the grid's `nowrap` was eating it. Where the
  row has no height of its own it grows to fit, as it does in both
  spreadsheets — and that is the one place the drawn geometry and `down()`
  disagree, which is what a `rows:` height is for.
- YAML holds it the way it always did: `A1: "one\ntwo"`, which the compiler
  reads back as two lines. Nothing in `cst` needed changing — `isPlainSafe`
  already refused a break and reached for the quoted form.
- 1682 → 1690 tests.

### 2026-08-22 — Refactoring pass over the whole tree (`AGENTS.md` §8)
After the seven slices of Phase 10, which is where the debt was: three gestures
that write a band arrived one at a time, and each brought a copy of the same
algorithm.

- **§8.2 — `hidden.ts` and `group.ts` were one algorithm with a different key.**
  A hundred and twenty lines each, differing in four places: the key, the value,
  what counts as *off*, and the wording. `setBandKey` in `bands.ts` is that
  algorithm once — the band already over the run takes it, a run nothing covers
  gets a band of its own, a band saying it about more than was named is a
  question — and the two callers are 43 and 55 lines of vocabulary.
  **The duplication was hiding an inconsistency**: hiding wrote `hidden: false`
  where another band still hid the run, and grouping took its key out
  regardless, leaving a wider band still grouping them. Sharing the answer fixed
  it, and there is a test that says so.
- **§8.3 — `table.ts` was 605 lines doing two subjects.** The outline is
  `outline.ts` now (138 lines: the levels, the gutter cells, the bracket, the
  controls, and the mark a hidden run leaves), and the table is what draws a
  table.
- **§8.3 — `preview.ts` answered seventeen messages with seventeen branches**
  that differed only in which function they called. They are one table keyed by
  the message kind; adding a gesture is a line rather than a branch, and the
  method that dispatches is nine lines. 507 → 463.
- **§8.3 — `draw.test.ts` was the largest file in the tree** at 1229 lines, and
  had been since the source it tests was split in two. It is `draw.test.ts`
  (303) and `table.test.ts` (810), with the fixtures in `harness.ts` — the
  convention `compile` already uses for exactly this.
- **§8.2 — `respelled` and `deindented`** were left exported when `splitBand`
  took over as their only caller. Private again.
- **§8.7 — checked rather than assumed**: no package imports upward, both
  `port.put` call sites still go through `checked`, nothing on a write path
  reads a computed value, and the grid still holds no state of its own.
- 1681 → 1682 tests. Comment shape: exports 503 blocks / 1086 lines (avg 2.2),
  private 342 / 370 (1.1), inline 70 / 100 (1.4), 9 over the limit — the same
  nine.

### 2026-08-22 — The outline gets its gutter, and a right-click stops taking the heading
Both from the real window, on the slice above.

- **The outline moved outside the headings**, where a reader of Excel or Sheets
  looks for it: a row above the headings per column level, a column left of the
  row numbers per row level. ADR-044 had weighed that against threading a second
  origin through the geometry and chosen the cheaper side; shown it, the reader
  asked for the gutter, which is the right call. **ADR-045** supersedes it and
  says what it cost: the table's width, the `left` a frozen column is pinned at,
  the `top` a frozen row is pinned at, the row numbers' own sticky left, the
  corner's, and a gap row's span are all `gutterOf(sheet, axis) + …` now. The
  origin is a function of the sheet, which is what it always was.
- **The outline's controls are legible and outside the headings.** Nine pixels
  was what a heading had room for and it was too small to see or hit; a gutter
  has as much room as it takes, so a level is 18px and the control 13px. The
  `+` that opens a collapsed run went in the gutter too, at the seam its run is
  hidden at, rather than inside the heading — where it read as part of the
  heading.
- **A right-click no longer throws away the selection.** `mousedown` fires for
  the right button too, so the heading under the pointer was being taken before
  the menu opened — and a menu about *these five columns* became a menu about
  one. The primary button alone selects now, and the right button takes a
  heading only where it lands outside what is already selected, which is what
  both spreadsheets do.
- 1679 → 1681 tests.

### 2026-08-22 — The outline, drawn and written
Phase 10's seventh item. `group:` was read by the loader, carried onto the
compiled band, and then dropped at the protocol — so an outline a spec declares
was invisible here. **ADR-044.**

- **The outline is drawn on the headings**: a bar along the outer edge of every
  heading in the run, one level in from the last, so a nested group reads as
  nested. Excel keeps this in a gutter of its own; a gutter moves the grid's
  origin, and the frozen panes, the pads and the table's own width are all
  measured from that origin.
- **The control at the end of the run collapses it**, which is a *write*:
  `group` with `hidden: true` is what the schema calls a collapsed group, and
  the editor has nowhere else to keep it (ADR-015, ADR-001). It goes through the
  `hidden:` band rows the last slice built, so collapsing and hiding are one
  path and one undo.
- **The `+` that opens a collapsed group sits on the heading the run is behind**
  — its own headings are not drawn — and the plain hidden mark stands aside for
  it, so there is one control rather than two marks about the same run.
- **Grouping is set from the heading's menu**, through §4.4's band rows: the
  band already over the run takes the level, a run nothing covers gets a band of
  its own, and a band that groups more than was named asks the question a wider
  band always asks. Level `0` is the schema's own way of saying ungrouped, and
  taking a run out of an outline writes it — or takes the key out where nothing
  else needs it.
- 1665 → 1679 tests.

### 2026-08-22 — Hide a column, and see that you did
Phase 10's sixth item, and the heading menu it needed to be reachable from.

- **Hiding is §4.4's band rows once more**, with `hidden:` where a size would
  be: the band already over the run takes the key, a run nothing covers gets a
  band of its own, and a band that hides more than was named asks the question a
  wider band always asks — change the whole band, or split it so the run alone
  is shown.
- **Showing again takes the key out**, and the band with it where that was all
  it said, and the `columns:` key with *that* where it was the only band under
  it. `hidden: false` is written only where another band still hides them, which
  is the one case where saying nothing would not be enough.
- **A hidden run is marked on the heading it sits behind**, which is the only
  thing that says something is there — and pressing the mark is the way back.
  Excel draws a doubled line; Sheets draws arrows; ours is a line down the edge
  of the heading, and it says which run it is holding.
- **The mark went missing beside a frozen band**, which is where it was first
  looked for: the run of drawn headings was broken by *every* pad, including
  the one of no width that always sits between the frozen columns and the
  window, so a column hidden in that seam had nothing after it to mark. Only a
  pad with width to it breaks the run now. The mark also asked its heading for
  `position: relative`, which would have taken a frozen heading out of its own
  band — a heading is already positioned by being sticky, and needed nothing.
- **A column is said by its letter.** `column 2 hidden.` was what the reader
  got, about a column whose heading says `B`. Both the hide and the drag say
  `column B` and `columns B-D` now.
- **The headings have a right-click menu**, because hiding had nowhere else to
  live and a toolbar is not where anyone looks for it. It hides what the reader
  has selected — one column, or the run of them — and offers the way back where
  something beside it is hidden. A cell's menu is the last item of this phase.
- **`intent/bands.ts` grew rather than `hidden.ts` copying it.** The split that
  takes a run out of a band, the runs it falls into, the band's own text
  respelled, the answer shape, and the rule that taking out the last band takes
  the key with it are one implementation, used by the size, the look and the
  hide alike. `size.ts` is 124 lines from 215.
- 1646 → 1665 tests.

### 2026-08-22 — Fit the column to what is in it
Phase 10's fifth item, and the answer to the one open question the phase had.
**ADR-043**, closing **§8 Q17**.

- **Double-click the edge of a heading and the column takes the width of its
  widest cell.** The host sends that run drawn as cells; the view measures each
  in the font it wears and sends back an ordinary drag, so the answers are
  §4.4's and the undo is the one every other write has.
- **A count of characters is not a width**, and measuring it settled the
  question the plan had left open. `東京第一倉庫` is six characters and 88px in
  the grid's own face; `Revenue` is seven and 57.7px. Anything that counted
  would have been wrong for every spec with Japanese in it — which is the specs
  this is being written for.
- **Measuring only what is drawn was the other candidate**, and it would have
  made the width depend on where the reader had scrolled to: the same
  double-click, two answers, same file.
- **A shell that cannot measure sends nothing back** rather than a width of
  nothing, and the column is left as it was.
- 1634 → 1646 tests.

### 2026-08-22 — A run of headings drags as one
Phase 10's fourth item, and the half of the third that was left. **ADR-042.**

- **Select B to D, drag any of their edges, and all three take that width.**
  The view already holds the run — it is the selection — so the gesture carries
  `first` and `last` where it carried one `at`, and a column dragged outside the
  selection is still just itself.
- **A band already over exactly the run takes the size**, which supersedes a
  note §4.4 had carried since the drag shipped: a band setting no size did not
  size the column, so dragging wrote a *second* band beside the first. That was
  right about layering and wrong about this — `- at: D, style: header` and
  `- at: D, width: 20` are one band written twice. Layering is for spans that
  differ.
- **Several bands, each reaching past the run, get one band over the run**,
  which wins for what is inside it and says nothing about what is outside.
  Splitting three overlapping bands is a bigger rewrite than a drag asked for.
- **A single band reaching past the run still asks**, and its split now takes
  the whole run out in one piece rather than one column of it.
- 1627 → 1634 tests.

### 2026-08-22 — A band already over the span is the band
From the real window, on the gesture that shipped yesterday: bold the whole
sheet, then unbold it, and the file carried **two** bands over `A-K` — one
saying `bold: true` and one saying `bold: false`.

- **A band over exactly that span is the band of its own**, so the look goes
  *into* it. Two entries with one `at` are one band said twice, and the second
  one only wins because it is later.
- **Put on and taken off leaves the file where it started.** What the band would
  say is what it says now with the ask over it, minus whatever the bands under
  it already say — the rule ADR-038 gives a cell, given to a band. Unbolding
  what only that band made bold takes the `style:` key out; a band left holding
  nothing but its `at` goes too, and takes the `columns:` key with it where it
  was the only band under it.
- **A flow value stays on its key's line.** `addSource` put every value on a
  line of its own, so a look added to a band read `style:\n  { font: ... }`.
  A one-line flow collection sits beside its key now; a block entry or a
  sequence item still cannot, whatever its length.
- 1621 → 1627 tests.
### 2026-08-22 — A bar over the grid, and the corner takes the sheet
Phase 10's second item, which could not be done without its eighth: the address
box had to move somewhere, and the only right place is a formula bar.

- **The bar is address, `fx`, and what the cell holds.** What it shows is what
  the *spec* holds — the formula, never what it comes to (ADR-014) — which is
  the same text the cell's own edit box seeds with, so the two can never
  disagree. `Enter` sends the edit typing into the cell sends: same intent,
  same answers, same refusals. `Esc` puts back what was there.
- **It is rebuilt rather than written into.** A bar built once closes over the
  selection it was built with, and sends an edit about whichever cell was
  selected *then* — which is a bug that only shows once the reader clicks
  elsewhere first. Every restate replaces it, except while the reader is typing
  in it, whose text is theirs until they leave.
- **The corner is the button it is everywhere else.** It takes the whole sheet
  — as *whole columns*, so bolding everything writes a band over the columns
  rather than a `cells:` entry per address the grid was drawing (ADR-041).
  `Cmd`+`A` is the same gesture and now goes the same way; before today it was
  a rectangle of eight thousand addresses and an answer nobody would take.
- **`Cmd`+`A` is caught where the preview can see it.** It was handled on the
  cell, so with the keyboard anywhere else — the corner button, having just
  clicked it — the browser's own select-all ran instead and painted the whole
  panel blue. It is one listener at the root of the view now, and the box a
  reader is typing in keeps its own `Cmd`+`A`.
- **The heading row is still 24px**, measured after the address box left it:
  the row's own height is the whole story now rather than a description of what
  the box made it, and the frozen panes are placed against that number.
- 1614 → 1621 tests.

### 2026-08-22 — The headings select, and a look over a column is a band
Phase 10's first item, and the half of its third that the first one makes
reachable. **ADR-041.**

- **A heading takes its whole run.** Click a column heading and every cell of
  that column is selected, out to the extent the sheet is drawn to; drag or
  `Shift`+click across the headings and it reaches. The headings the selection
  touches are lit, as they are in Excel and Sheets — which is also how a reader
  can tell a whole-column selection from a tall one.
- **The grip keeps its own gesture.** Pressing the *edge* of a heading sizes it
  and pressing the heading selects it, which is one `event.target` check and
  the reason the two never fight.
- **A look over a whole column is one band.** Bold over the whole of B writes
  `- at: B, style: { font: { bold: true } }` — through the normalizer, so a
  declaration that already says it is reused — and not four hundred `cells:`
  entries. The per-cell answers are not offered there at all: §4.4 already
  says a *size* is a band and never forty cells, and the argument was about
  the gesture rather than about the property.
- **The rectangle cannot say which it was**, so the gesture says it. A sheet
  has no last row in the spec, so `B1:B400` and "the whole of B" are one
  rectangle; the view holds how the selection was taken and sends it with the
  look. Inferring it from the shape would have been the guess ADR-001 forbids.
- **What it claims is what it moves**: the cells the sheet *holds* in the span,
  not the four hundred addresses the rectangle covered. That is the count the
  reader is shown, and it is what the checker is given.
- 1597 → 1614 tests. Comment shape: exports 457 blocks / 978 lines (avg 2.1),
  private 317 / 337 (1.1), inline 61 / 82 (1.3), 9 over the limit.

### 2026-08-21 — Refactoring pass over the whole tree, and a phase that was missing from the plan
Six findings, and a plan that now says what a reader of Excel or Sheets finds
missing on their first minute in the grid.

- **§8.1 — the cell keys were spelled three times** and the axis vocabulary
  five. `CELL_HOLDS` / `CELL_WEARS` and `Axis` / `BAND_KEYS` live in `spec`,
  which is where the schema's own words belong; `MODELED_KEYS.cell` is derived
  from the first pair rather than listed beside it.
- **§8.2 — "the entry under this key" was written 21 times in four shapes.**
  `cst` owns the tree, so it owns `entryOf` and `holds`. The view's barrel
  re-exported twenty-five names nothing imports — the extension takes
  `@yxl-vscode/webview/protocol` and never the barrel — and `EXCEPT` was
  exported with no caller outside its file.
- **§8.3 — `draw.ts` was 530 lines doing three jobs.** The page is `draw.ts`
  (146), everything inside the scroller is `table.ts` (367), and the three
  "is this cell selected / copied / found" predicates sit with the rest of the
  view's own state in `showing.ts` — which is what both files were reaching
  for. `draw.test.ts` covers both and was **kept whole**: splitting it needs a
  fixture seam that would cost more than the split buys, which is a decision to
  revisit when the next gesture lands in `table.ts`.
- **§8.4 — `menus.ts` shipped without tests.** It has them, `fit` included:
  pulling a panel back onto a narrow view is arithmetic that cannot be seen in
  jsdom and is exactly what a test should hold.
- **§8.5 — a ticked box was not true.** Phase 8's first item said "and the row
  and column headers as selectors" and shipped without them, admitting it in
  its own note. That half is Phase 10's first item now.
- **§8.9 — `@types/vscode` had drifted eight months past the engine.** The
  manifest says `^1.104.0` and the caret had resolved to 1.125, so an API the
  oldest supported VS Code does not have would have compiled here. Pinned.
- **A phase went in between.** Everything a reader reaches for that is *not a
  cell* — heading selection, the select-all corner, autofit on a double-click,
  hide and unhide, **grouping**, a formula bar, the selection's count and sum,
  `Cmd`+`B`, the font face and size, a right-click menu — is **Phase 10**, and
  structural edits moved to 11. Insert and delete are gestures on a heading, so the
  headings had to become selectors first. **§8 gains Q17**, which is the one
  real question in it: what *fit to contents* measures, when the fonts are in
  the view and the cells are on the host.
- **Grouping was the gap nothing had written down.** `group:` (`docs/spec.md`
  §4) is read by the loader and carried onto the compiled band, and then
  *dropped at the protocol* — so an outline a spec declares is invisible here,
  and no ticked box ever claimed otherwise because none of them mentioned it.
  It sits beside hide-and-unhide in Phase 10, because the schema makes them one
  gesture: `group` with `hidden: true` **is** a collapsed group, so the `−` on
  the bracket is a write to the file rather than a state of the view.
- 1590 → 1597 tests. Comment shape: exports 451 blocks / 968 lines (avg 2.1,
  down from 2.2), private 312 / 332 (1.1), inline 59 / 79 (1.3), 9 over the
  limit — the same nine as the last pass.

### 2026-08-21 — The bar reads as a spreadsheet's
The other half of the panel-width problem, and the shape a reader of Sheets or
Excel is already carrying: the controls that have *choices* are menus.

- **Colour is a palette, not a swatch and an ×.** Text colour and fill each open
  a panel holding the way to take the colour off, the two rows of standards
  Sheets and Excel both offer, and *Custom…* for the picker — which is where
  everyone looks for "no fill", and the `×` beside the swatch was not.
- **The six border buttons are one button.** They and the line style live in the
  panel it opens, as they do in Sheets. That is 200px of bar returned.
- **Freeze is the menu it is everywhere else.** One button opening *Freeze up to
  B2* and *No frozen panes*, named in words rather than an icon and an ×, and
  reachable with no cell selected — taking a freeze off is about the sheet.
- **What that bought:** the bar is **one row at 780px and two at 420px**, where
  it was two and three. A panel that would hang past the edge of the view is
  pulled back onto it, so a menu at the right end of a narrow panel still opens
  where it can be read.
- **A click anywhere else closes an open panel**, which is what the scrim under
  it is for; `Esc` closes it too. Which menu is open is the view's own state,
  like the border line, so a redraw arriving under an open palette does not
  shut it.
- 1585 → 1590 tests. Comment shape: exports 443 blocks / 960 lines (avg 2.2),
  private 317 / 337 (1.1), inline 59 / 79 (1.3), 9 over the limit.

### 2026-08-21 — A toolbar that fits the panel it is in
From opening the preview in a real window: at a 400px panel — which is what a
preview beside the text actually gets — the bar ran off the right edge and the
controls at that end could not be reached at all.

- **It wraps rather than overflows.** A control the reader cannot see is a
  control they do not have, so the bar breaks onto a second row instead of
  running past the edge, and its buttons no longer squash to fit: 2 rows at
  780px, 3 at 420px, nothing hidden at either.
- **The groups are ruled apart** the way every spreadsheet rules them, which a
  wrapped bar needs more than a straight one — without it a second row reads as
  one undifferentiated run of icons. The two alignment axes are two groups now,
  not six buttons in a row.
- **A border button shows which edge it draws.** At 16px an edge that was only
  *lit* read as a plain box, so all six looked alike; the named edge is drawn
  heavier than the rest and they tell apart at a glance.
- **The freeze button stopped looking like a seventh border button.** It sits
  next to them, and a frame with two crossing lines is a frame; it has the
  corner that stays filled in now.
- Measured at 360, 420, 520 and 780px under headless Chrome, on the view's own
  markup rather than a hand-written copy of it.
- 1582 → 1585 tests.

### 2026-08-21 — Panes that stay put
Phase 9's last item, and the first thing the preview honours that is about the
*sheet* rather than about a cell. **ADR-040.**

- **`freeze:` is read, drawn, and written.** The loader reads it as an address
  where it read a key it did not model before, the compiled sheet carries it,
  and the view keeps the rows above it and the columns left of it still while
  the rest scrolls.
- **The frozen band is drawn beside the window, not inside it.** A reader at row
  800 is looking at a window that starts at row 780, so a pane drawn only from
  what the window holds would vanish at exactly the moment it earns its keep.
  The host sends the frozen rows and columns as their own band, and the view
  draws them in flow with the gap under them shortened by their height, so the
  sheet is as tall as it ever was. A freeze deeper than half a window is left
  scrolling: a pane taller than what it is read against is not a pane.
- **The grid's borders no longer collapse.** Under `border-collapse: collapse`
  a cell's background and the line beside it belong to the *table*, which Blink
  paints under every positioned cell — so a sticky pane cannot cover what
  scrolls beneath it, and the scrolling text showed straight through the frozen
  columns. Each cell carries its own right and bottom line now: the same 1px
  grey, and a frozen cell that is actually opaque.
- **Measured under headless Chrome, three times over.** The first render said
  the panes stuck but leaked; the second said the leak was not a crack in the
  layout, because the frozen cells abut to the pixel; the third — painting the
  frozen band pink and the scrolling text blue — said the blue was on top, which
  is what named the border model as the cause. The heading row was measured too:
  it is 24px because the address box makes it so, and it is pinned there now so
  the offset a frozen row is placed at is a fact rather than a guess.
- **Setting one is not a resolution-table row.** A freeze has one place to live,
  so `setFreeze` returns an `Intent` rather than a list of answers and applies
  without asking. The toolbar freezes at the selected cell and takes it off
  again; `A1` freezes nothing, so that button is disabled there.
- **A sheet that is `split:` is refused, and a spec that is `freeze: A1` is
  still read.** The schema forbids a sheet having both, and `split` is not
  modeled here — taking out a construct the preview cannot draw is not a choice
  a reader can weigh, so it is a refusal with the reason. The other way round,
  a pointless freeze the compiler rejects still loads here, and there is a
  `deferred` fixture that says so.
- **A sheet key can be added at all now.** `add` into a mapping that opens a
  sequence item took its layout from the entry on the `- ` line and wrote a
  second item; it takes the layout from the line the new key lands beside, and
  refuses to write *above* the entry the dash opens rather than moving it. Every
  sheet-level key after this one needed that fixed.
- 1549 → 1582 tests. Comment shape: exports 439 blocks / 953 lines (avg 2.2),
  private 312 / 332 (1.1), inline 60 / 81 (1.4), 9 over the limit.

### 2026-08-21 — A column you can drag
Phase 9's fourth item, and the first gesture in the grid that is not about a
cell at all. **§4.4 gains a `setSize` table.**

- **The edge of a heading is a grip.** The size follows the pointer while the
  drag lasts and is sent once, on the way up: every step of a drag would
  otherwise be an edit, and the grid is a projection rather than a thing that
  holds a width (ADR-001). What is sent is the size in the units the spec keeps
  it in — character units across, points down (`docs/spec.md` §4) — rounded to
  what a person would write rather than to what the pointer said.
- **A size is a band, and which band is §4.4's new row.** Nothing sizes it yet:
  write one of its own, in the block form the upstream examples write bands in.
  A band over that column alone: change its `width`. A band over several: a
  question, because the drag was about one column and the band is about three.
- **The split keeps every key the band had.** `- { at: D-F, width: 12, style:
  header }` becomes three entries that each still say `style: header`, because
  the pieces are the band's own text with its `at` written over rather than a
  band built again from what compiled. A band whose `at` is a placeholder is
  refused rather than written over, as the `formulas:` split already refuses.
- **A band that sets no size does not size it.** `- { at: D-F, style: header }`
  says nothing about width, so dragging D writes a band of its own beside it,
  and the two say different things about the same column — which is what
  layering is for.
- **An answer that moves no cell says nothing about cells.** A resize changes
  no value and no look, so its `expects` claims none and the choice panel,
  which said "0 cells", now says only what the answer does.
- **The grips were measured, not reasoned about.** At `right: -3px` they were
  half eaten by the heading's own `overflow: hidden` — the same trap as the
  border overlay, found the same way, by rendering `view.css` under headless
  Chrome before shipping it rather than after.
- 1521 → 1549 tests. Comment shape: exports 433 blocks / 935 lines (avg 2.2),
  private 302 / 322 (1.1), inline 59 / 79 (1.3), 9 over the limit.

### 2026-08-21 — Refactoring pass over the whole tree (`AGENTS.md` §8)
After the five commits that built Phase 9's toolbar, which is where the debt
was: each control landed on the end of the file it belonged in, and each one
brought a copy of the vocabulary it needed.

- **§8.1 — the four border edges were spelled in four places, in two orders.**
  `compile` and `normalize` had `left, right, top, bottom`; the toolbar had
  `top, right, bottom, left`; `webview/cell.ts` paired each with its CSS
  property. They are `BORDER_EDGES` in `spec` now, `BORDER_SIDES` is that list
  with `all` in front of it, and the CSS pairing was derivable.
- **§8.2 — three helpers were one function under two names.**
  `properties(said)` was private and identical in `intent` and `normalize`,
  `only(said, keys)` likewise, and `ordered(said)` in `normalize` was `only`
  over every property. They are `propertiesOf` and `ordered` in `spec`, one
  each, with `ordered`'s second argument defaulting to every property — which
  is what made the third copy disappear. `columnAt` / `rowAt` in `webview` are
  exported only for their tests and were **kept**: pixel to row is the whole
  scrolling model, and it is the arithmetic worth asserting on directly.
- **§8.3 — two files were doing two jobs each.** `intent/style.ts` (619 lines)
  held both which places can answer a style write and what bytes each place
  gets; they are `style.ts` (294) and `writes.ts` (330), and the seam is three
  names wide. Splitting it is what showed `fromCell` belongs with the writers.
  `webview/toolbar.ts` had each control's table two controls away from its
  renderer; it reads in the order the bar reads now, and the SVG marks are
  `marks.ts` with tests of their own.
- **§8.4 — `spec` had no test file at all**, for the package every other one
  takes its vocabulary from. It has one, including the case that makes
  `propertiesUnder` worth having: `border.left` covers the line *and* the
  colour, since the edge is the unit a border is taken away at. `underFormat`
  got the direct test it never had.
- **§8.6 — the over-limit list moved for the first time in four passes.** Nine
  of the eleven earn it: three type docs standing in for the per-field comments
  §8.6 forbids, and six privates each carrying a constraint the code cannot
  show. Two did not — one explained what makes a resolution row a choice, which
  is this file's job, and one described the scroll handler the scroll handler
  describes.
- **§8.5 — the README's "Applies a look" row had grown a clause per pull
  request** until it was five sentences about three things. Two rows now: what
  the toolbar does, and what happens when a look comes from somewhere else.
- **§8.7 — clean, and checked rather than assumed.** No package imports upward.
  The one `applyEdit` in the tree is behind `Port.put`, which is called from
  exactly two places and both of them after `checked`. Nothing reads a computed
  value on a write path — the number-format list renders one for a *label*,
  which is display (ADR-014). `Showing.line` is the view's own setting, not
  cell state (ADR-001).
- **§8.9 — vitest 4.1.11**, on its own commit; nothing else in the tree is
  behind, and the one lint info left in the source is gone.
- 1502 → 1521 tests. **This pass ends at: exports 427 blocks / 918 lines
  (avg 2.1), private 289 / 309 (1.1), inline 57 / 76 (1.3), 9 over the limit.**

### 2026-08-20 — An edge you can draw, and Phase 9's toolbar is done
The last control of §6 Phase 9's first item: a border on any edge, with the
line to draw it in. **The item is ticked.**

- **Six buttons and a line.** All, top, bottom, left, right, none — each puts
  the toolbar's line on the edges it names, and `none` takes all four off. They
  *act* rather than hold, so unlike every other control on the bar none of them
  is ever lit: a border is a thing done to a cell, not a thing a cell wears in
  one place a switch could read.
- **The line lives in the view, not in the cell.** It is the reader's choice of
  `thin` … `hair` and the toolbar is rebuilt on every restate, so it had to
  become `Showing.line` — the third thing the view holds of its own, beside
  what is copied and what is being looked for.
- **A border is written the way a person writes one.** Four edges alike are
  `border: thin`, an edge with no colour is `border: { bottom: double }`, and
  four edges taken away are `border: null` — rather than the eight-leaf spelling
  the model holds them in. The §1 convergence claim is made of exactly this
  sort of thing, and the model's leaves being finer than the schema's is the
  reason it needs saying in the writer.
- **What it will not do yet, and is written down rather than hidden**: a border
  round the *outside* of a range, which asks each cell for a different edge —
  one want per address rather than one for the rectangle, which `setStyle`
  already takes but the `wear` message does not carry.
- **A `thin` border was invisible on the edges that matter**, and running it is
  what found that. The grid is a collapsed table, so a cell's own border and the
  grid's own line meet at the same pixel and CSS resolves the tie: same width,
  same style, and then *the cell further left, or further up, wins*. Every left
  and top edge in the sheet lost. `double` came through only because it renders
  2px, and wide beats narrow. A cell's borders are now drawn on an element of
  their own over the cell rather than collapsed with the grid, so what the spec
  says is what is seen — and the clipboard keeps the real `border-*` CSS it
  needs (ADR-028).
- **The first attempt at that made it worse and the second was measured**, which
  is the note worth keeping. An overlay at `inset: -1px` sits in the pixel the
  cell's own `overflow: hidden` clips, so every border disappeared. jsdom has no
  layout, so no test here could have caught either that or the tie it was fixing.
  What settled it was rendering the real `view.css` under headless Chrome
  (`--headless --screenshot`) with the candidates side by side and looking:
  `inset: 0` draws, `inset: -1px` draws nothing, and a 1px border on a collapsed
  cell really does lose its left and top. **That is the loop to reach for when a
  question is about layout** — the tests answer what the DOM holds, not what it
  looks like.
- **A cell written for its look alone goes when the look does.** Drawing a
  border on an empty address writes `D6:` with nothing but a `style:`; taking it
  off left the cell with no key at all, which is not a cell (`docs/spec.md` §3)
  and which `cst` refused, correctly, as an entry with nothing to put it back
  beside. The entry is removed instead, so the round trip through an empty
  address is byte-for-byte again. Where `cells:` holds nothing else, the refusal
  stands and the file is untouched — the gesture asked to take a look off, not
  to take a `cells:` block out.
- **An answer names the cells it would write on.** A border sends four
  properties at once, so a rectangle whose style leaves have a supplier and
  whose colour leaves do not is *mixed* by §4.4's reckoning even when it is one
  cell — and "apply it to every cell here" is a strange thing to read about one
  cell. It says what it would put it on now, in the same words the other answers
  use.
- 1482 → 1502 tests. Comment shape: exports 417 blocks / 905 lines (avg 2.2),
  private 298 / 324 (1.1), inline 57 / 76 (1.3), 11 over the limit — the same
  eleven.

### 2026-08-20 — A number under a format, from the toolbar
The last of §4.4's `setStyle` row that is not a border, and the first control
whose answer does not go in a `style:` at all.

- **A number format is a key of the cell's own**, so the write goes to
  `format:` beside `value:` rather than into the style mapping — except where
  the style *written out on the cell* is what says it, which is rewritten in
  place. Over a declaration the cell names, the key layers: `{ value: 1,
  style: money, format: "0.0%" }` keeps `money` rather than detaching from it,
  which is the sentence `docs/spec.md` §6 ends on.
- **`StyleLayer.key` finally earns its keep.** It has said `style` or `format`
  since the first style write; now it decides *where* the answer is written —
  a band that gives a format changes its own `format:` key, not a `style:`
  mapping it never had.
- **Anything the cell itself says is the cell's answer**, whichever key said
  it. `itsOwn` asked for the `style:` key alone, so a cell's own `format:` was
  offered as somewhere else to go, labelled as a row band. One predicate,
  three words shorter, and the label goes with it.
- **`onCell` writes keys rather than a look.** It was one source into one key;
  a cell can now gain a style and a format from one gesture, and a scalar cell
  expanded for both has to be one op or the two would overlap. Taking both away
  leaves `A1: 1` again.
- **The formats are offered as what they would make of *this cell's* number**,
  with the code in the tooltip. They were samples of some other number at first
  — `12.3%` beside a cell holding `1234.5678`, which would render `123456.8%` —
  and a label that is a rendering of a number the reader cannot see is a lie
  about the only thing the control does. Found by running it. Where the cell
  holds no number the code is the label, since there is nothing to show.
- A code the list does not hold is added to it rather than dropped, so the box
  never lies about what the cell wears; typing one that is not on the list is
  still a job for the YAML.
- 1467 → 1482 tests. Comment shape: exports 417 blocks / 905 lines (avg 2.2),
  private 290 / 316 (1.1), inline 57 / 76 (1.3), 11 over the limit — the same
  eleven.

### 2026-08-20 — Where the text sits
Both alignment axes and wrap, which is the third group of the toolbar and the
first one that needed nothing new underneath it: ADR-039 landed this morning,
and a `null` ask is what a group of three buttons is made of.

- **A group where only one holds at a time.** Left, centre, right; top, middle,
  bottom. Pressing the one already lit takes it off, which is the same gesture
  as unbolding and was not expressible a day ago — there is no "no alignment"
  value, only the absence `null` now says.
- **Wrap is a switch, not one of a group**, because the schema makes it a
  boolean, so it turns off as `false` and drops out where nothing under it says
  otherwise. Two shapes on one row of §4.4's table, and the difference between
  them is the difference the schema draws.
- **The marks are drawn rather than written.** Four ragged bars for the
  horizontal axis, three stacked for the vertical, as inline SVG that takes
  `currentColor` — there is no glyph for "align centre" that renders the same on
  three platforms, and a letter would have needed a legend.
- 1460 → 1467 tests. Comment shape: exports 416 blocks / 904 lines (avg 2.2),
  private 280 / 306 (1.1), inline 56 / 75 (1.3), 11 over the limit — the same
  eleven.

### 2026-08-20 — yxl 0.3.5, and an attribute that says it is not set
The pin moves to 0.3.5 and this editor learns what it added — the answer to
yxl#71, filed here this morning. **ADR-039**; §8 Q16 closed.

- **The bump found the drift in one run**, which is what §8.9 says a bump is
  for: `styling.yxl.yaml` upstream now writes `{ value: 2, format: null }` and
  `{ extends: header, fill: null }`, and our loader refused both. A spec that
  builds and does not open is the divergence ADR-011 exists to prevent.
- **`Style.cleared` is the set of attributes a style writes `null` at**, beside
  the fields rather than inside them, and `flatten` lays it down before the
  values so that a value written beside a clear wins — the schema's own rule,
  and what makes `{ border: { all: thin, left: null } }` four edges.
- **`StyleWant` became `StyleSays`**, because it stopped being only about what a
  reader asks for: a *layer* says the same three things. `StyleValues` is now
  only the settled look — what a cell finally wears — and `settled` is the one
  crossing. Everything that draws takes the settled form, so a cleared attribute
  is not painted and not shown on a switch.
- **The gesture that had no answer has two.** Clicking *no fill* on a cell under
  a filled column band now offers the band **and** the cell, which writes
  `A1: { value: 1, style: { fill: null } }`. Taking a fill off a cell that wears
  a declaration writes `{ extends: header, fill: null }` — a header, unfilled —
  rather than detaching to an inline copy of everything the declaration said.
  Both are the upstream examples, and both are what a reader asked for on
  2026-08-20.
- **A border is taken away at the edge.** Our leaves are `border.left.style` and
  `border.left.color`; the schema's unit is the edge, so a cleared edge is both
  leaves and the writer folds them back into `border: { left: null }`. Writing
  `{ left: { style: null } }` would not load.
- **A `rich:` run refuses it**, as upstream does: a run inherits nothing, so
  there is nothing for `null` to take away.
- 1439 → 1460 tests. Comment shape: exports 416 blocks / 904 lines (avg 2.2),
  private 276 / 302 (1.1), inline 56 / 75 (1.3), 11 over the limit — the same
  eleven, with five new inline lines that are all schema rules the code cannot
  show.

### 2026-08-20 — Unsetting a style property requested upstream
- Filed [yxl#71](https://github.com/t-ujiie-g/yxl/issues/71) for ADR-038 / §8
  Q16: a spec can say a property **is** something and has no way to say it is
  **nothing** where a band or a declaration already says it is something.
- **Writing it up turned a GUI request into a round-trip defect**, which is the
  stronger half of it. A workbook with a column-wide fill and one deliberately
  unfilled cell — an ordinary thing in Excel — was built with openpyxl, run
  through `yxl extract`, and rebuilt: the exception cell comes back **filled**,
  and `extract` reports that everything rebuilds as read. There was nothing it
  could have written. Same family as yxl#48, but on a written cell and with no
  warning at all.
- Both spellings the request could take are errors today (`fill: null` — "must
  be a hex color or a mapping"; `fill: none` — "not a valid hex color"), so
  giving either a meaning is additive. Measured rather than assumed, as was
  everything above.
- **Nothing is built here in the meantime.** The editor's honest answer —
  change the band, and say what that moves — already exists; an editor-side
  consolation would be thrown away the day the schema can say it.

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

### 2026-08-20 — A colour you can pick, and a look you can take off
The toolbar's next two controls, and the ask they needed: a fill and a text
colour, each a swatch showing what the selected cell wears, each with a button
that takes it off again.

- **`StyleWant` is the write path's twin of `StyleValues`** (**ADR-038**): the
  same leaves, each also allowing `null`, which asks for the property to be taken
  off. The schema says "no fill" only by leaving the leaf out, so the ask had to
  be a third state rather than a value — `false` is a look, not an absence.
- **A property supplied from under the cell has no answer on the cell.** Where a
  band or a declaration gives the fill, nothing written on the cell takes it
  away, so `setStyle` offers only the answers at the layer that supplies it, with
  what each would move. Asking for it off where the *cell* carries it writes the
  cell back to what it was.
- **Taking the last leaf out takes its mapping with it.** `- { at: A, style: {
  fill: X } }` goes back to `- { at: A }`, not to `- { at: A, style: {} }`, and
  the pruning stops at the construct's own node so a declaration is never
  removed out from under the cells that name it. Without this, "put a fill on
  and take it off" left a residue, which is the standard the font switches
  already meet.
- **The picker is the browser's**, and its `#rrggbb` is not the spelling a spec
  writes: what leaves the view is `RRGGBB`, parsed through `parseColor` at the
  edge so a value that is not a colour never becomes an edit.
- **The switches stopped being addressed by position.** `.look:nth-child(3)` was
  the underline switch until a fifth control landed; each now carries the name of
  the leaf it sets.
- **A colour landed on the wrong cell, and running it is what found that.** A
  colour input commits when it is *dismissed*, and the click that dismisses it
  has already moved the selection — so the fill went to whatever was clicked
  next. Every toolbar control now acts on the rectangle its toolbar was drawn
  over rather than on the live selection, which is the same thing for a button
  and is not for a picker. Pinned in `index.test.ts`, where the whole gesture is
  driven: select, open, select elsewhere, commit.
- **Taking a fill off a cell under a band changes the band**, which is the whole
  column, and that is the only answer there is: what a reader wants there — this
  one cell, uncoloured — is a thing `docs/spec.md` cannot say (ADR-038). Filed
  as [yxl#71](https://github.com/t-ujiie-g/yxl/issues/71) rather than worked
  around here.
- Comment shape: exports 414 blocks / 897 lines (avg 2.2), private 273 / 299
  (1.1), inline 52 / 70 (1.3), 11 over the limit — the same eleven.

### 2026-08-20 — A rectangle that takes its look from more than one place
The refusal the last pass left behind, answered: §4.4's `setStyle` step 4, which
is the last thing between the four font switches and a rectangle a reader would
actually select. **Phase 9's third item is done.**

- **The rectangle is grouped by where each property comes from**, per cell and
  per property rather than per cell. `origins` returns one group per supplying
  layer — a declaration, a band, an override, or nothing — carrying the
  properties it supplies and the cells that read them from it. The single-origin
  path is the one-group case of the same function, so the table's first three
  rows did not change.
- **Two answers, and never a pick between them.** *Apply it to every cell here*
  writes the look on each cell whatever it wore before; *split it by where each
  cell takes it from* changes the declaration in `defs.styles`, the band in
  `columns:`, and the override, each where it lives, and writes on only the cells
  nothing supplies. Both carry the count of what they would move — the split's
  includes the cells outside the rectangle its declaration reaches, which is the
  number that decides which answer a reader wants.
- **Where an override hides it, only the split is offered.** Writing on a cell
  under an `overrides:` entry that gives a `style:` changes bytes and nothing a
  reader can see, and the single-origin path has refused that since it was
  written; "apply to all" would have quietly reintroduced it for the one cell in
  the rectangle that had one.
- **"Nothing to write" and "cannot write" stopped being the same answer.** They
  had been one `null`, which was invisible while every answer covered the whole
  rectangle and wrong the moment one covered part of it: a split whose cells were
  already as asked took the whole answer down with it. `onEvery` now returns the
  ops it has, empty included, and each caller decides — an answer with no ops is
  not offered, a *part* with none is simply a part that writes nothing.
- **The refusal that told a reader to try the cells apart is gone**, since the
  editor now does that itself. What is left says only that nothing here can carry
  the look, which is the case it was always about.
- **Two answers that leave the file the same are one answer.** Found by running
  it: bolding a selection where only the last cell is plain reaches three origins
  and asks, but the declaration and the band already say `bold: true`, so both
  answers come down to the one cell — the question had no side to take. The
  answers are now compared by the text they would leave, and where a lone answer
  survives the rule that has always applied to one applies here too: it is taken
  without asking. The rule now lives in `setStyle` alone, over both paths.
  Comparing results rather than ops is what makes this hold: the ops differ
  (`style: header` rewritten over itself, `bold: true` set where it is already
  true) while the bytes do not.
- Comment shape unchanged where it counts: exports 413 blocks / 893 lines
  (avg 2.2), private 269 / 295 (1.1), inline 50 / 67 (1.3), 11 over the limit —
  the same eleven, with thirteen new private one-liners.

### 2026-08-19 — A look you can apply, and the table that decides where it goes
The first thing a reader can click that changes how the workbook *looks*: four
font switches above the grid, and §4.4's `setStyle` table underneath them.
**Phase 9's second item is done**; the toolbar's other controls are the same
path with more UI.

- **`setStyle` finds where the look comes from and offers what the table says.**
  A declaration every cell reading it follows, a band over the whole column, or
  these cells — each with the count of what it would move, shown before the
  choice. Where nothing else says how the cell looks there is one answer, and it
  applies without asking, which is what makes bolding a plain cell feel like
  bolding a plain cell.
- **What lands on the cells is the normalizer's answer (ADR-037)**, which is
  what it was built for: bolding a cell that wears `base` writes
  `{ extends: base, font: { bold: true } }`; bolding one where a declaration
  already says exactly that writes `style: strong`; bolding a plain cell writes
  the look itself. `normalize` grew `written`, which spells one out — a name, or
  a flow mapping with the leaves nested back into the keys they came from, and
  colours and number formats quoted, since `000000` and `0.0%` are not the
  strings they look like.
- **A cell written as a value becomes one that carries a look as well**:
  `A1: 1` is rewritten as `A1: { value: 1, style: … }`, keeping the value's own
  spelling. An address nothing had written gets a cell that is only a look,
  which `docs/spec.md` §3 has a sentence for.
- **`addSource` reaches inside a flow mapping now.** `A1: { value: 1 }` had no
  way to gain a `style:` key: `add` handled the flow form and `addSource` refused
  it. They share one writer, and a source with a line break in it is still
  refused, since a flow mapping is one line.
- **The grid carries the looks the spec declares** — `CompiledGrid.styles`,
  resolved through whatever each one extends. It is what the normalizer is asked
  against, and it is part of the projection rather than something every caller
  works out again. What will not resolve is reported where a *cell* reads it, so
  a cycle is named once rather than once per declaration in it.
- **A style layer says which key of the construct set it.** A cell's `format:`
  is a layer of its own beside its `style:`, and without telling them apart the
  first style write copied the format into the style mapping. `StyleLayer.key`
  is `style` or `format`, and the §8.6 duplicate doc comment on `flatten` — two
  of them, on one declaration — went with it.
- **What it will not do yet**: a rectangle whose cells take the look from
  different places is refused with a reason and no answers, which is the next
  item ("apply to all" / "split by origin"); and a look under an `overrides:`
  entry offers to change the override rather than the cell, since writing under
  it would change nothing a reader can see.
- **A switch turned off comes off.** Bolding a cell and unbolding it leaves the
  file byte for byte where it started: the property is dropped rather than
  written `false`, an emptied `style:` key goes, and a cell left holding only a
  value goes back to being that value. What a declaration the cell *names* says
  is the exception — `{ extends: header, font: { bold: false } }` is the honest
  form of "a header, but not bold", and dropping to a look that merely resolves
  the same would lose the kinship.
- **A look the cell itself carries is the cell's own answer**, not a second
  place it could come from. It was being offered as one, labelled as a row band,
  which is what a reader saw on the second press of the same switch.
- **The switches follow the selection**, which is not where they were first
  drawn: a click restates the view rather than redrawing it, so the toolbar had
  to be rebuilt there too. Found by running it, and pinned by a test that draws
  with nothing selected and restates with something.
- **This pass ends at: exports 413 blocks / 893 lines (avg 2.2), private 252 /
  278 (1.1), inline 49 / 66 (1.3), 11 over the limit** — the eleven the last pass
  kept, and nothing new.

### 2026-08-19 — Refactoring pass over the whole tree (`AGENTS.md` §8)
At the Phase 7 boundary, and the pass that finally cleared the comment backlog.

- **§8.1 — the schema key names stay literals, with the reason written down.**
  `'value'`, `'formula'`, `'cells'`, `'overrides'` are spelled in `intent` while
  `spec/keys.ts` owns `MODELED_KEYS`. They are not the same thing: `MODELED_KEYS`
  is the set a *reader* validates against, and these are path segments a *writer*
  builds. Promoting them would make `[...path, KEY.formula]` of every path for a
  rename-safety a YAML schema does not have, and the guard that matters — the
  checker compiling before and after — is already there. Left, with the note.
- **§8.2 — `held(string): Holds` was byte-identical in `resolve.ts` and
  `paste.ts`**, and `refused(why)` in `direct.ts` and `paste.ts`, with thirteen
  more refusals built as literals. One `holding` and one `refused`, both in
  `direct.ts` where `Holds` and `Intent` live.
- **§8.2 — two different functions were named `beside`.** The one in `intent`
  names a file by its last two segments; the one in `extension/inspect.ts`
  resolves it against the spec. The second is `nearTo` now. No dead exports:
  every export outside `normalize` (which Phase 9 will call) has a real caller,
  measured rather than assumed.
- **§8.3 — `paste.ts` was 527 lines and two subjects.** The gestures —
  `pasteRange`, `pasteText`, the shape question — stay; where a rectangle *lands*
  cell by cell, and what a blocked group becomes, is `landing.ts`. 527 to 279 and
  254, and the one file both gestures share is now named after what it does.
- **§8.4 — `excepting()` had no direct test.** It decides how an answer names a
  group, singular and plural, and a definition's answer is not an override; all
  three are pinned now.
- **§8.5 — §4.2's `normalize` row still described ADR-008's third step**, which
  ADR-037 superseded four hours earlier. Fixed; the README's prose already said
  the new thing.
- **§8.6 — the backlog went from 37 blocks over the limit to 11.** Two passes
  had left it at 38, which is how a measurement becomes wallpaper. Every export
  doc that ran to four lines lost the line that was a *why* or a second pointer;
  every private doc that ran to two or three is one line where one line says it.
  **The eleven kept, and why:** `Removal`, `FacetOrigin` and `DrawnCell` are
  types whose conventions §8.6 says to state once in the type's own doc rather
  than per field — the first is the rule's own example — and the eight private
  ones each carry two constraints that one line cannot hold honestly
  (`intoBlock`'s indentation *and* its quoting, the lexer's bare-name quirk in
  `about`, and so on). The next pass can start from that list rather than
  re-reading them.
- **§8.7 — `layers ok`**, and the new `landing.ts` imports downward only: the
  paste gestures hand it what it needs and it hands back ops.
- **§8.9 — biome 2.5.9**, in its own commit, with `biome migrate` moving the
  schema stamp. Node 22.21 and pnpm 11.21 are current; nothing else is behind.
- **This pass ends at: exports 404 blocks / 876 lines (avg 2.2), private 234 /
  260 (1.1), inline 47 / 64 (1.4), 11 over the limit** — from 37, and the private
  average down from 1.3.

### 2026-08-19 — One answer per origin, and Phase 7 is complete
A rectangle landing on cells that came from different places used to have one
answer: paste into the ones that can take it. It now has one *per group* of the
ones that cannot — **§8 Q14 is closed, and with it Phase 7**.

- **The shape of the answer changed on the way in.** Q14 asked for *take the
  range ones out of the paste* beside *take them all out*, and excluding a group
  turns out not to be an answer at all: with two groups in the way, dropping one
  leaves the other still refusing, and with one group it is the answer that was
  already there. So a group answer **resolves** its group and leaves the others
  out — *Write the one that is filled by a range as an override, and paste the
  rest*.
- **The exception each origin allows is the one the row already had**: a cell a
  range fills, a parameter, or a CSV field becomes an override, which is what
  `docs/spec.md` §23 is for; a cell reading a definition is written as a value
  of its own, which is the `detach` answer a single cell is offered. Nothing new
  was invented for the rectangle — the answers a cell has, applied to a group of
  them.
- **`overrides:` learned to take several entries as one edit**, with the key
  written once however many go in; the single-cell `override` is now one of
  those. An override still opens only when a reader asks for it (ADR-007) — here
  the asking is choosing the answer that says so.
- **A group still has its answer where nothing else can be done.** Landing on a
  range's anchor as well as its filled rows leaves the paste with no cell it can
  write at all — and the cell reading a definition still has its own answer, so
  that is what is offered, without the *and paste the rest* it has not got.
- **`Delete` keeps its one answer.** A cell a range fills has nothing that would
  empty it, and an override that says a cell is blank is not something §23
  offers. Said out loud rather than left as a gap.
- **§4.4's `empty` ② moved to Phase 10**, where the `data:` conversion offer is:
  it is the same judgement about when a spec wants a table, and a row left
  half-ticked would have kept §10 pointing at a phase with nothing to do in it.
  That is what made this the last Phase 7 item rather than the second-to-last.
- **This pass ends at: exports 398 blocks / 886 lines (avg 2.2), private 240 /
  303 (1.3), inline 47 / 64 (1.4), 37 over the limit.**

### 2026-08-19 — The style normalizer, and what the compiler's own writer does
`packages/normalize` was an empty `export {}` with a position in `layers.json`.
It now holds the decision every style write will pass through (ADR-008), and one
of ADR-008's three steps changed on evidence (**ADR-037**).

- **What it is:** `normalize(wanted, declared)` — the look a construct is to
  contribute, and what the spec already declares, resolved. Out comes the name
  of a declaration that already says it, an `extends:` variant of the nearest
  one, or the look itself. `null` where there is nothing to write. No I/O, no
  document, no patch: a decision on values, which is what makes it testable
  before anything writes.
- **The evidence that changed step 3.** A workbook built from yxl's
  `styling.yxl.yaml` was extracted back with the pinned `yxl extract`, to see
  what the compiler's own writer does with looks: a look worn twice becomes a
  declaration, a look worn once is written inline at the cell, and no `extends:`
  is emitted anywhere. So a GUI that declares `style_2` for one bold cell would
  not converge on hand-written specs — it would diverge from what yxl itself
  writes. Step 3 is now inline; the repetition that leaves is Phase 12's
  extraction proposal, which is where a rewrite of sites the reader never
  touched belongs.
- **A variant has to pay for itself**: at most `NEARBY` (2) properties restated,
  and at least as many inherited as restated. Without the second rule a
  declaration sharing one property becomes an `extends:` line that buys nothing
  and claims a kinship that is not there. And a declaration setting a property
  the look does not is never extended at all — nothing in the schema takes a
  property back, so it would arrive on the cell.
- **`STYLE_PROPERTIES` is exported from `spec`** and is what orders the answer,
  so the same look is the same bytes however the caller built the record.
- **This pass ends at: exports 389 blocks / 871 lines (avg 2.2), private 235 /
  298 (1.3), inline 47 / 64 (1.4), 37 over the limit** — five more exports, and
  the averages where they were.

### 2026-08-19 — A formula anywhere in a range, and the range split around it
Typing a formula into a cell a `formulas:` range fills now has both of §4.4's
answers, wherever in the range the cell sits. **The `formulaRange` row is
complete.**

- **The typed formula is shifted back to the anchor.** `=B3*0.1` typed one row
  down means `B1*0.1` to a range anchored a row up, and the answer says which —
  *Change the formula of the range at `C1`, which reads `=B1*0.1` there* — so
  what lands in the file is never a surprise. That is `units.moved`, the scanner
  §8 Q2 answered with (ADR-031); a formula it cannot move with certainty is not
  offered as the range's.
- **The split is the other answer**: the range cut into the pieces the cell
  leaves of it, each re-anchored with the same formula as it applies where it
  now starts, and the cell a one-cell range of its own. Three ranges where there
  was one, which is what `docs/spec.md` §3 writes for the exception that is a
  change of rule — the exception that is a *one-off* is the override beside it.
  It claims to move one cell, and the checker holds it to that.
- **The checker could not have held it to that before.** `diff` compared the
  formula a range *stores*, so re-anchoring a piece read as a change to every
  cell in it, and moving a range's `at` while keeping its text read as no change
  at all — wrong in both directions. It now compares the formula as it applies
  at each cell, which is what the workbook would hold.
- **An override at the anchor is refused**, and no longer offered: `docs/spec.md`
  §23 allows one on any cell of a filled range *except* its top-left, where
  Excel keeps the shared formula. `overridable` is the one rule both the offer
  and the write path ask, so they cannot disagree.
- **The split is not offered where the entry's own keys hold a `${...}`** — its
  `at` and its `formula` are rewritten, and writing what a placeholder resolved
  to would spend the parameter.
- **A filled cell now answers with its own formula (ADR-036)**, which is what
  found the real defect: the box a reader types into opened with the *anchor's*
  formula, so adding `*1.1` to what it showed wrote a formula for a row the cell
  is not on — and that one, shifted back, is off the sheet, so the range answer
  could not be offered at all, leaving one answer where there are two.
  `cellAt` shifts it now, and `paste`, `diff` and the view stop compensating:
  the `↧ C2` a filled cell showed instead of a formula, the *Excel shifts the
  references per cell* hedge on hover, and the empty string it copied out as are
  all gone. Tier 4 reads `C3` of a range back out of the built workbook as
  `B3*0.1`, so the real compiler agrees.
- **This pass ends at: exports 384 blocks / 863 lines (avg 2.2), private 231 /
  294 (1.3), inline 47 / 64 (1.4), 37 over the limit** — one below the 38 it
  started at.

### 2026-08-17 — Refactoring pass over the whole tree (`AGENTS.md` §8)
The first pass over everything since the Phase 2 boundary. Four findings, taken
in the order the lenses come in; the same 1322 tests pass through all of them,
and 5 more hold the gap the fourth one found.

- **§8.2 — `preview.ts` said the same five lines nine times.** Every message
  that writes began by fetching the spec, refusing where it had not finished
  loading, and stripping `kind` off what arrived. One `writing(make)` holds the
  guard now and the dispatch calls the write path directly, which puts each
  message in *one* place rather than two. 514 lines to 436, and the split §8.3
  would otherwise have wanted is no longer worth making.
- **§8.2 — `marked(path)` was written twice**, in `patch` and in `intent`, both
  spelling a path as JSON so two could be compared. It belongs to whoever owns
  a `Path`, which is `cst`.
- **§8.3 — `draw.ts` was 612 lines and three subjects.** The vocabulary — what
  the view is *showing* and what it can *ask* — is now `showing.ts`, which the
  drawing, the panels and the boxes all read from rather than from each other;
  and the two boxes that are not cells, the address box and the find bar, are
  `boxes.ts`. 612 to 443, and a type cycle that was about to form did not.
- **§8.4 — the four key predicates had no direct test.** `undoing`, `copying`,
  `pasting` and `looking` decide which modifiers count, and `Cmd`+`G` not
  working was exactly that layer. They are pinned now, `alt`-disqualification
  and all.
- **§8.5 — where the work goes next was read wrong**, by me, in the last change:
  §1's rule is *the first phase with an unchecked box*, and Phase 8 finishing
  does not make that Phase 9. **Phase 7 has three rows still open** — §4.4's
  table, the style normalizer, and range edits with mixed origins — and the
  normalizer is what ADR-034 is waiting on anyway.
- **Considered and left**: `packages/normalize` is an empty `export {}`. §8.2
  would delete scaffolding that holds no API, but its position is declared in
  `layers.json` and §4.2 and Phase 7 is about to fill it. Left, with the note.
- **This pass ends at: exports 383 blocks / 856 lines (avg 2.2), private 226 /
  296 (1.3), inline 46 / 63 (1.4), 38 over the limit** — the same 38 it started
  at, across two more files.

### 2026-08-17 — Find in the sheet, and the box that says where you are
`Cmd`+`F` looks through the sheet and `Cmd`+`G` goes on through what it found;
the corner above the row numbers is an address box, which is where every
spreadsheet keeps one. **Phase 8 is complete.**

- **The search runs on the host**, over the compiled sheet, because the view can
  only see the window it was drawn. Something in row 800 of a sheet showing rows
  1–200 is found, and going to it moves the window — the same message a scroll
  sends, so nothing new had to learn how.
- **What is searched is what a cell holds** — its value and its formula, matched
  without case — rather than the text it is shown as. `2400000` finds the cell
  that `2,400,000` is drawn from, which is the one a reader would then edit. A
  `formulas:` range answers **at its anchor**, the one address where changing it
  means anything.
- **The two boxes outside the grid are updated rather than rebuilt.** A redraw
  while the reader is typing would take the box out from under them, so the
  address and the count are written into the elements that are already there,
  and the address box is left alone while it has the keyboard. Where a redraw
  *does* have to happen — the window moving — the box is given the keyboard
  back afterwards.
- **Going somewhere brings it into view.** Selecting a cell is not scrolling to
  it, which the first try left out: the keys had been scrolling all along
  because *they* did it themselves, and the search and the address box went
  through a different door. Both scroll now, and a test holds it.
- **The keys work from inside the find box**, where the reader actually is.
  `Cmd`+`G` reaches the cell's own handler only while a cell has the keyboard,
  and after a search nothing does.
- **Only a window this view asked for finishes a going.** The first try put the
  keyboard back in the find box on *every* drawing, which meant editing the YAML
  with the bar open had the focus taken away on each keystroke. A drawing is
  usually the file changing under a reader who is typing somewhere else; the one
  that answers a window we asked for is the only one that is ours.
- **Which palette a box wears is decided by which side of the grid it is on**,
  and it is one rule now rather than three copies: outside, VS Code's input
  tokens; inside, the sheet's own white-on-white. The address box had the first
  while living in the second, which in a dark theme is a black hole in the
  corner of a white spreadsheet.
- **The address box takes what a reader would type**: `b2` as readily as `B2`,
  and anything that is not an address is said rather than swallowed.
- 17 new tests, 1318 in total; comment shape held at 38 over the limit.

### 2026-08-17 — One question about a rectangle, and the size of what it would do
A paste or a `Delete` that five hundred cells cannot take used to name the first
cell's reason and count the rest — *(and 2 others here)* — which tells a reader
nothing about the other 499. It now groups them.

- **The origins are grouped and counted**: `3 of the 500 cells here cannot be
  pasted, so none were: 2 are filled by a range, 1 reads a definition`. That is
  half of §8 **Q14**; the other half, answers that apply *per group*, is still
  open and now has a sharper shape.
- **One cell still says its own reason.** `B2 holds a formula that A1 would move
  off the sheet` is worth more than any count, and a group of one is not a
  group. The rule is: one, its reason; more, what stood in the way.
- **What stood in the way is the cell's origin**, not a string match. A refused
  cell now carries the construct that refused it — the same table §4.4 is
  written from — so the counting is over what the spec actually says rather than
  over sentences that happen to read alike.
- **The size of the diff is measured before it lands**, not estimated:
  `patch.rewrites` counts the lines a patch would rewrite, each shape is applied
  against the file in memory, and the answer carries the number — *As one
  `data:` block — 4 lines* against *As `cells:` entries — 50 lines*.
- **A paste too big to see is asked about even where it has only one shape.**
  Under forty cells it lands as it always did; over that it says what it is and
  waits, which is the whole of the item's *one summary, one answer*.
- 9 new tests, 1301 in total; comment shape held at 38 over the limit.

### 2026-08-16 — Refactoring pass after the clipboard (`AGENTS.md` §8)
Three findings, taken in the order the lenses come in. Nothing about what the
editor does changed: the same 1293 tests pass, unedited apart from the fixtures
the first finding simplified.

- **§8.2 — one type's shape was showing up as four problems.** `Offer` and
  `Refused` carried the gesture a refusal was about as *four* mutually exclusive
  nullable fields (`typed`, `ranged`, `pasted`, `text`), which the type did not
  say. Downstream: three near-identical twenty-line builders, an if-else chain
  over nullables in the view, and every test fixture writing four `null`s. It is
  one `About` union now, the three builders are one `theseOnly(about, what,
  cells)`, the view switches on `about.is`, and the fixtures say what they mean.
- **§8.2 — `standing()` was written twice**, in `clear` and in `paste`, with the
  verb as the only difference. One, in `direct`, taking the verb.
- **§8.3 — `write.ts` was 674 lines and three subjects.** Split at the joints
  that were already there: `clipboard.ts` for `Cmd`+`C` / `Cmd`+`V` and the
  shape question (211 lines), `undo.ts` for `Cmd`+`Z` (59), and `write.ts` for
  what a reader types and the half both share (366). The tests followed the
  code, one file each.
- **Considered and left**: `paste.ts` at 450 lines has a real boundary in it —
  the rectangle from inside, the rectangle from outside, and where a cell lands
  — but it is under §8.3's threshold and the three share more than they differ.
  Left, with the note, so the next pass has a reason rather than a rediscovery.
- **§8.4** every export the last four changes added has a direct test; **§8.5**
  the phase table, ADRs and README were brought up to date as each landed;
  **§8.7** `layers ok`, and the view holding one less decision than it did.
- **This pass ends at: exports 371 blocks / 831 lines (avg 2.2), private 222 /
  289 (1.3), inline 41 / 54 (1.3), 38 over the limit** — the same 38 it started
  at, across 4 more files.

### 2026-08-16 — Paste in, and the shape question answered on the buttons
A rectangle copied in Excel or Google Sheets now lands in the grid. §8 **Q11 is
closed** and §4.4's `empty` row is answered for a rectangle from outside.

- **The grid's own rectangle wins while the clipboard still holds what its copy
  put there**, and the clipboard's wins where it does not — only the first moves
  a formula and empties a cut, so it is the one to prefer where both could
  apply. What the view sends is where the paste goes, what it has of its own,
  and what its copy last wrote out; the host reads the clipboard and decides.
- **The clipboard is read on the host** (ADR-035), because a webview is never
  given a `paste` event to read one from. Two attempts said so: the cell itself
  got no event, and neither did a `<textarea>` focused inside the key handler,
  which is the pattern that works in a browser. Both were measured in the
  extension host — in jsdom a synthetic event had made both look fine, which is
  the lesson worth keeping. `vscode.env.clipboard.readText()` is the API for it,
  and the view is left saying *where* the paste goes and what it has of its own
  rather than deciding whose paste it is.
- **A field means what it would mean typed into that cell.** `1234` is a number,
  `1,234` is text, `TRUE` is a boolean — the same reader a keystroke goes
  through, so a paste cannot mean something a typed cell could not.
- **The shape is asked once, with the two numbers on the buttons**: *As one
  `data:` block — 4 lines* against *As `cells:` entries — 600 lines*. That is
  what makes it a question a reader can answer rather than a preference they are
  asked to hold an opinion about. The `data:` block is offered only where
  nothing writes those cells yet: two writers for one address is not a shape
  question but a mistake.
- **The values land and the look does not** (ADR-034). A style write goes
  through the normalizer, the normalizer is Phase 9, and writing looks without
  it would put an anonymous inline style on every one of two hundred pasted
  cells — which is the exact outcome ADR-008 exists to prevent. The `text/html`
  flavour is not read at all yet, and §8 Q12 stays open with a better reason
  than before.
- **The landing is the same code the internal paste uses.** Both build a list of
  *this address holds this*, and one function writes them: over the entry that
  is there, or as new `cells:` entries. The refusals, the *ones that can take
  it* answer, and the byte-for-byte undo come with it for nothing.
- 31 new tests, 1293 in total; comment shape held at 38 over the limit.

### 2026-08-16 — What the look on the clipboard actually reaches
Measured rather than assumed, by pasting a styled rectangle out of the preview.

- **Google Sheets takes all of it** — the dark fill, the white bold heading, the
  number formats, the values. Nothing was left behind.
- **Excel takes everything but the fill.** Values, bold, font colour and number
  format all arrive; the fill does not, which for a white-on-dark-blue heading
  leaves a cell that looks empty with its text still in it. Three forms were
  tried in one pass and none of them moved it: `background-color`, the
  shorthand `background` that Excel's *own* exported HTML writes, and the
  `bgcolor` attribute its importer is supposed to read. Hex instead of the
  CSSOM's `rgb()` was a real bug and was fixed, and was not the cause on its own.
- **It is left there, on purpose** (ADR-033). yxl makes Excel files: a reader
  who wants the workbook builds it, and that path carries every style the spec
  declares. Copying out to Excel is a convenience beside it, and one that
  already carries the values, the bold and the formats.
- **The leads are kept rather than the disappointment** (§8 Q15), and the first
  of them is to paste *out of* Excel and read what it puts on the clipboard,
  instead of guessing at its reader from the outside — which is what this pass
  did, and why it got one of three things right.

### 2026-08-16 — Copy out, in both the flavours the other spreadsheets speak
A rectangle copied in the grid now lands on the **system** clipboard as well,
as `text/plain` **and** `text/html` — so `Cmd`+`V` in Excel or Sheets receives
what the reader was looking at (ADR-028).

- **The split is ADR-028's own**: the text carries the *value* (`1234.5`), the
  table carries how it *looked* (`1,234.50`, bold, filled). Either alone loses
  half the point — TSV arrives with every format and colour gone, HTML arrives
  with the numbers already turned into strings.
- **The look is not built twice.** The `<td>` the clipboard gets wears the CSS
  the grid's own cell wears, out of the same function; a style the preview
  learns to draw is a style Excel receives, with nothing to keep in step. That
  function now hands back *declarations* rather than writing them onto an
  element, because reading them back off one is where the colours were lost:
  the CSSOM answers `rgb(31, 56, 100)` where Excel wants `#1F3864`.
- **The fill goes on twice, and neither is decoration.** Excel took the bold,
  the white text and the number format from the first attempt and passed over
  the fill, which left a white heading on white. `background-color` is the long
  form its clipboard reader does not take; the shorthand `background` is what
  Excel's own exported HTML writes, and `bgcolor` on the `<td>` is what its
  importer has always read. Sheets reads the CSS. Both go out.
- **It is written inside the gesture that asked for it**, which is why
  `execCommand` is still here: it is the only *synchronous* way a page can put
  more than one flavour on the clipboard, and the asynchronous API is
  permission-gated. Where it cannot reach the clipboard at all, the grid says
  so rather than leaving the reader to find out in Excel.
- **What it will not do quietly**: a rectangle reaching past the drawn window
  is refused with a sentence rather than copied half blank, a cell a
  `formulas:` range fills carries nothing (its formula means something else
  wherever it lands), and a merge copies as its values rather than as a merge.
- 14 new tests, 1262 in total. Comment shape came *down* to 38 over the limit.

### 2026-08-16 — Room to work in
The grid drew a sheet exactly as far as its last written cell, which makes it a
table of what is there rather than a place to work: there was nowhere to paste
into, nowhere to type a row that does not exist yet, and no empty column to
reach for. It now draws **40 rows and 6 columns past** what the spec writes, and
is a grid even for a sheet that writes nothing at all.

- **The window machinery was already there** — 200 rows by 50 columns, scrolled
  from the view (ADR-019). It simply never had more than the data to show, so
  the fix is in one function: what a sheet's extent *is*.
- **It costs nothing in the payload.** Only cells with something to show are
  sent; the empty room is drawn by the view from the row and column counts it
  already gets. A spec that writes four cells still sends four.
- **What it makes reachable** is §4.4's `empty` row — typing into an address
  nothing writes, and now pasting into one. Both were implemented and neither
  could be got at without scrolling to a cell that was not drawn.
- Growing the room further as the reader scrolls is deliberately not in: it is a
  fixed amount past the last cell, and the roadmap says so rather than implying
  a sheet without an end.
- 1 new test, 1248 in total; four that pinned the old extent updated to the new
  one.

### 2026-08-16 — Copy, cut and paste, as a place rather than a buffer
`Cmd`+`C`, `Cmd`+`X` and `Cmd`+`V` work inside the grid. What a copy holds is a
**sheet and a rectangle** — never the cells in it — so the paste is worked out
from the file as it stands when it lands (ADR-032), through the same checker as
a keystroke. §8 **Q11 answered** for a paste inside the grid.

- **A place cannot go stale.** A buffer of cells would be a copy of the spec,
  which the grid is not allowed to hold (ADR-001), and would be wrong the moment
  anything else edited the file. A place can only stop *being* a place, and the
  resolver says so. A copy survives a redraw, an edit to an `$include` under it,
  and an undo, without any of them being thought about.
- **A formula takes its references with it**, which is what the last change was
  for. A cell a `formulas:` range fills moves by where *that cell* sits, not
  where the range is anchored — its offset from the anchor is added to the
  paste's, so `C3` of a range anchored at `C2` lands meaning what it meant.
- **What it lands on keeps what it wears.** `style:` and `format:` are not
  touched; only `value`, `formula`, `rich` and `type` are, which is the mirror
  of the rule `Delete` already follows. So a paste carries no looks yet — the
  toolbar that would make that meaningful is Phase 9, and writing styles before
  the normalizer (ADR-008) would scatter anonymous ones through the spec.
- **Where nothing is written yet, `cells:` entries** — §4.4's `empty` row
  answered for a rectangle. Written as one `addSource` where the sheet has no
  `cells:` key at all, because that key can only be added once; and back to
  front where it has one, since entries added at one place are spliced from the
  end of the file.
- **A hole in the source stays a hole.** An empty cell pastes nothing rather
  than emptying what it lands on: Excel clears it, and this editor does not
  destroy a cell nobody named. A cut that would land on the cells it is taking
  is refused rather than ordered, and rich text is refused.
- **A cell that cannot take it refuses the whole**, offering *Paste into the
  ones that can take it* — the same machinery `Delete` uses, which is now the
  third caller of it.
- **The cut and the paste are one patch**, so one undo takes both back. The
  `cells:` mapping a cut empties is kept when the same patch fills it again,
  which needed the collapse in `clear` to know what its patch is adding.
- 36 new tests, 1247 in total; comment shape held at 39 over the limit.

### 2026-08-16 — A formula that knows where it is
`units.moved(formula, by)` gives a formula as it applies a number of columns and
rows away — `A2*0.1` copied two right and three down is `C5*0.1`. This is §8
**Q2 answered** (ADR-031), and it is what the rest of the `formulaRange` row and
the paste of a formula cell were both waiting on.

- **It scans rather than parses.** The only question a move asks is which words
  are references, and the shape of a word plus the character after it answers
  it: a `(` makes it a function, a `[` a table, a `!` a sheet. No syntax tree,
  no grammar to keep correct against Excel's.
- **What does not move comes back byte for byte** — including the half of a
  reference that is anchored. `$A01` moved down is `$A2`; moved *right* it is
  `$A01`, padding and all, because nothing about it moved. Strings are left
  alone however much they look like references (`IF(A1="A1", …)`), and so are
  table references and their nesting.
- **A formula it cannot move with certainty is refused**, naming the word that
  stopped it: a reference that would leave the sheet, a quote or bracket that
  never closes. ADR-026's rule one level down — better a sentence than a
  formula Excel reads as `#REF!`.
- **There is no oracle for this one.** yxl never translates references: a
  `formulas:` range compiles to Excel's shared formula and Excel does the
  shifting on open, so ADR-012's differential test has nothing to compare. The
  case list stands in for it — `$` anchors, `LOG10(`, `A:A`, `1:10`, a doubled
  quote inside a string, a number format full of `$` and `#`, and both edges of
  the sheet. 24 tests, 1211 in total.
- No caller yet, deliberately: the reference semantics are worth reading on
  their own, and the copy/cut/paste that uses them is the next change.

### 2026-08-16 — One parse per gesture, not one per cell
Selecting 800 cells and pressing `Delete` took **6.6 seconds**, and every one of
them was spent parsing the same 11.7 KB file eight hundred times. It now takes
**124ms**.

- **The cause was in the shape of the parameter, not in a loop.** `intent` took
  a `Text` — a function from a file to its bytes — and every function that
  needed a *tree* parsed those bytes itself. `clearRange` asks `clearCell` about
  each address, `clearCell` reaches the file through `located`, and `located`
  parsed. One gesture, N+1 parses of one file, and nothing in the code said so.
- **`Reading` says it instead**: the text as it stands, and the tree parsed from
  it, worked out once per file however many cells ask. `reading(text)` makes one
  and it is built once per gesture in `write.ts` — so the rectangle, the
  candidate list a refusal offers (which called `located` several times over),
  and an override each parse what they read once.
- **It carries the text as well as the tree** because not every file an edit
  reads is YAML: the `external` row writes a field of a CSV, and running the
  YAML parser over somebody's data file to hand back its bytes would be a
  strange way to save time.
- **What holds it there** is a test that counts the reads: a 2×2 rectangle over
  a spec reads the file **once**. Before this it read it five times, and a
  40×20 selection read it 801.
- Nothing about what is written changed — same patches, same refusals, same
  expectations, and the whole suite passed unmoved. 4 new tests, 1187 in total;
  comment shape held at 39 over the limit.

### 2026-08-16 — Undo in place, and the guard that lets two stacks share a file
`Cmd`+`Z` in the grid no longer shows the text, runs the editor's undo and hands
the keyboard back. It takes the last edit back **in the file**, and the grid
never loses focus. The old path is still there and still right — it is what
answers the moment this editor is not the last thing to have touched the file
(ADR-030).

- **The history is recorded where the edit is made.** Every write already knew
  the patch that takes it back — `verify` works the inverse out before applying
  anything (ADR-026) and hands it back — and the write path was dropping it on
  the floor. It now goes into `patch`'s `History`, with the file it landed in
  and the cells it moved.
- **The guard is byte equality, and nothing cleverer.** The preview remembers
  what it left each file at; the undo runs only where the file still says
  exactly that. A hand edit in the text, a save from elsewhere, a preview that
  has not written yet — all of them go to the editor's own stack, which is the
  one that describes the file in those cases.
- **The undo is a write, so it goes through the loop.** Compile, apply,
  compile, diff — against the cells the forward edit moved, which is why the
  step carries them. That is also why `patch`'s history stopped applying
  patches: its `undo`/`redo` called `applyPatch` directly, and a history that
  writes without the checker is precisely the bypass ADR-009 forbids. It now
  keeps the record (`did`, `took`, `redid`) and `verify` does the writing.
- **What the two stacks forced.** A `WorkspaceEdit` goes on the text document's
  undo stack, including the ones this editor makes to undo itself. So once the
  grid has unwound its own history, the shell's next undo would *redo* the edit
  rather than reach past it. The grid says `nothing left to take back.` and
  stops there; the text editor still has everything from before.
- **The one write it cannot take back ends the history it has.** A cell whose
  value is a field in a companion CSV is written as text, and text has no
  inverse patch. Rather than leave a history that skips it — an undo that took
  back the edit *before* the CSV write and left the CSV alone — that write
  clears the history, and the gesture goes back to the editor's stack.
- 10 new tests, 1183 in total, and the seven over `patch`'s history rewritten
  to the shape it has now. Comment shape held: exports 332 blocks / 734
  lines (avg 2.2), private 183 / 258 (1.4), inline 36 / 44 (1.2), 39 over the
  limit — the same 39 as the last pass.

### 2026-08-16 — Empty the ones that can be
A rectangle holding cells that cannot be emptied refused the whole and left the
reader nothing to do about it. It now refuses and **offers**: *Empty the ones
that can be — 6 cells (Sales!A1, Sales!B1, Sales!A2, …)*. Taking it empties
those and leaves the rest where they are.

- **The refusal's subject is now a cell or a rectangle.** `Refused` carries
  `ranged` beside `typed`, and a choice taken over a rectangle goes back as one
  (`emptied`), resolved against the file as it stands rather than against
  anything remembered. This is the machinery the oversized paste needs, built
  where it was cheapest to build. A rectangle offers no `overrides:` — an
  exception is written for a cell (`docs/spec.md` §23), not for a selection.
- **A mapping emptied of every entry is taken out whole.** `cells:` holding
  nothing is not a mapping and the spec would not load — the checker caught it,
  which is the loop working, but the honest edit is to remove the key. This also
  fixes the single-cell case that was refused before: deleting the only cell a
  sheet had could not be undone, because nothing would have been left to put it
  back beside (ADR-026). Removing `cells:` is invertible, so it is now made.

### 2026-08-16 — The selection a gesture acts on is the live one; undo from the grid
Two things the first real use of `Delete` over a range turned up.

- **The rectangle was read from a stale snapshot.** Selecting a range
  *restates* the grid — the cells keep their handlers so that a click can be
  followed by a double-click — and only an edit redraws it. The `Delete`
  handler read the selection out of the `Showing` it was drawn with, so a
  rectangle selected after the last redraw was invisible to it and the
  *previous* selection was emptied instead. The view now asks for the cell the
  key was pressed on and `wire` reads the live selection, which is the only
  place it lives. The grid holds no selection state of its own — the one thing
  ADR-001 says it must not do — and this was that rule bending back.
- **`Cmd`+`Z` did nothing from the grid.** An edit is applied as a
  `WorkspaceEdit`, so the stack that holds it is the text document's, and the
  command reaches that stack only where the text has the keyboard: with the
  panel focused, VS Code hands `undo` to the webview, which has nothing to
  undo. The grid now sends the gesture to the host, which shows the document,
  runs the editor's own undo or redo, and gives the keyboard back to the cell
  the reader was on. One stack, still the file's (ADR-010) — this is where a
  custom editor would use `CustomDocumentEditEvent`, which a panel beside the
  text does not have (ADR-020).

### 2026-08-16 — Delete over a range
`Delete` over a selection of more than one cell now empties every cell in the
rectangle, as **one** edit: one patch, one entry in the undo stack, one
recompute. A single cell is untouched — it still goes through the typed path,
which has answers to offer where the direct edit is refused.

- **The rule per cell is the one a single delete already had.** `clearRange`
  asks `clearCell` about every address in the rectangle that holds anything, so
  a cell whose entry is `{ value: 1, style: header }` keeps its style, and a
  `data:` field becomes `null` (`docs/spec.md` §3, §9). Addresses that hold
  nothing are skipped rather than refused.
- **All or nothing.** A rectangle holding one cell that cannot be emptied — a
  formula range fills it, a CSV supplies it — refuses the whole and writes
  nothing, saying how many stood in the way of how many and giving the first
  cell's own reason: *2 of the 4 cells here cannot be emptied, so none were:
  `B1` is where this range's one formula is written… (and 1 other here)*.
  Emptying what can be emptied is a real answer, but it is an answer to
  *choose*, and the machinery for choosing over a rectangle is the oversized
  paste's — so it is the next box, not a guess made here (ADR-001).
- **A latent defect in the inverse, found by the first multi-cell undo.**
  `invert` reads every op against the document as it stands *before* the patch,
  so the inverse of `remove A1` anchored on `B1` — which the same patch was also
  removing. Undo then refused with *nothing is keyed `B1` here* and left the
  file emptied. The inverse now anchors each restore on the next sibling the
  patch is **not** taking out, and restores that share an anchor go back in the
  order they were written. This was reachable by any patch removing two
  adjacent entries, not only by this gesture (ADR-026).

### 2026-08-16 — Refactoring pass over the whole tree, comments first (`AGENTS.md` §8)
A reader said the comments had grown, and had begun to turn up in odd places.
Both were true, and the second was the symptom of the first: a four-line
rationale sitting above one field of an object literal, and in one case two doc
comments stacked on one method. Walked §8.6's rules over every source file in
every package, and the other lenses behind them.

- **Comments, in numbers.** Doc comments on exports: 1811 lines to 693, the
  average from 5.8 lines to 2.2. Doc comments on private functions: 719 to 240.
  Inline comments: 152 lines to 44. Blocks over the length that reads as an
  essay: 296 to 41, and each of the 41 was read and kept for a reason. Some
  1,800 lines gone across 97 files, with no line of code changing what it does.
- **What went, by §8.6's three deletions.** Paraphrases of the line under them
  (*"Shift takes the selection to here"* over `if (event.shiftKey)`); design
  rationale that belongs in an ADR and already is (*why* the core is
  synchronous, *why* the checker is the only door — ADR-004, ADR-009); and
  narrations of past defects (*"is how an override went out as an edit and came
  back refused"*), which were true the day they landed and are noise once
  merged. What stayed is the constraint the code cannot show — `table-layout:
  fixed` is inert without a width; `isReferenceObject` is not a type guard; a
  block scalar's body already ends at a line break — in one or two lines, at the
  line it governs.
- **Doc comments on exports stay mandatory** and every one is still there,
  cut to what the API is and one pointer (`docs/spec.md §n`, ADR-nnn) where the
  rule lives elsewhere. Interface fields carry none of their own, as §8.6 says.
- **§8.2 while there.** `cst/entries.ts` had two pairs of functions that shared
  their guard-and-neighbour half — `insertion` with `insertedBlock`,
  `addition` with `addedBlock` — now `intoSequence` and `mappingFor`, called by
  both. Four `codes.ts` headers said the same paragraph four ways; one line
  each. `Going` was exported from `keys.ts` for nobody. `knows` had already gone
  with the last change.
- **Tests got the same treatment**: a test's name says what it asserts, and the
  forty-odd comments that restated it or told the story of a bug are gone;
  what remains is *why this value and not the obvious one*.
- Considered and left: `resolve.ts` is 398 lines and now five rows of the
  resolution table, which is where the last sweep said to look again. It is
  still one function per row and reads as the table; splitting it per row would
  scatter the thing it is. Left, and the note stands.
- **So that it does not grow back**: `AGENTS.md` §4 now carries the rules in the
  short form for the moment of writing, §8.6 states a *shape* — one to three
  lines on an export, one on anything private, two inline, above the statement
  and never inside a literal — and names the channel that produced most of the
  excess: PR prose landing in the source. `scripts/comment-shape.mjs` lists
  every block over the limit and gives the totals, which §8.8 now records per
  pass. **This pass ends at: exports 324 blocks / 702 lines (avg 2.2), private
  167 / 242 (1.4), inline 36 / 44 (1.2), 39 over the limit** — the number the
  next pass holds to.

### 2026-08-16 — Phase 8: a selection that is a rectangle

- **The selection is a range now**, and the gestures that make one are the ones
  in a reader's hands: drag across, `Shift`+click the far corner, `Shift`+arrow,
  `Cmd`+`A`. The view holds an *anchor* beside the cell it has selected — one
  moves, the other stays — which is the whole of the model, and what makes a
  range shrink back the way it grew.
- **`Cmd`+arrow goes to the edge of the block**, along a run to its far end or
  across a gap to the next thing there is; `Home` and `End` run along the row,
  and `Cmd`+`Home` goes to the first cell. Answered over the cells the host has
  *drawn*, because those are the ones the view has — a window's worth is a long
  way in either direction, and going past it asks for the next.
- **`Shift`+`Tab` steps back rather than reaching**, which is the one place
  `Shift` does not mean *extend*. Excel and Sheets agree, and it is exactly the
  sort of thing that is only wrong once somebody's hands are on it.
- The keys moved out of `draw.ts` into `keys.ts` as they arrived: where a key
  takes the reader is a question about a sheet and a set of cells, which is
  answerable — and answered — without a DOM.
- Nothing here writes anything yet. Deleting, copying and pasting a rectangle
  are the next three, and each is one intent for the whole of it.
- **Two things a reader found the moment they had hands on it.** Committing an
  edit moved the selection down and left the *focus* behind with the box that
  had just been removed, so the arrow keys did nothing until something was
  clicked — true since Enter first moved down, and only findable by typing and
  then reaching for an arrow. And a refusal put the reader back at the cell they
  typed into without taking the anchor with it, so the selection was stretched
  between there and where Enter had gone. Both are one line; the second is the
  cost of a second corner, and the first is what happens when a thing is moved
  without being taken along.

### 2026-08-16 — The JSON Schema exists upstream (§8 Q7 answered)

- yxl now publishes `docs/yxl.schema.json`, **generated** from `docs/spec.md`
  rather than written beside it. Pointing an editor's YAML support at it gives a
  spec completion and structural validation while it is being typed.
- **It changes nothing here.** ADR-011 is unmoved: a schema knows shapes, not
  meanings — it cannot say the style a cell names is declared or that an
  override lands on a cell something writes — so `yxl build --check` is still
  the validator of record and this editor's loader still validates only what
  projection requires.
- The mapping is **not committed**: it belongs in a personal `settings.json`,
  not in everyone's. Whether the extension should contribute it so a reader gets
  it without configuring anything is asked in §8 Q7 for the release phase.
- Housekeeping from the same day: a personal `.vscode/settings.json` had been
  swept into a commit by a `git add -A`, and CI failed on it — Biome checks
  every file in the tree, and that one was somebody's own. Untracked, ignored,
  and **Biome now reads `.gitignore`**, so the repo's idea of what is private is
  the linter's too.

### 2026-08-16 — Phase 7: the third verdict stopped being a refusal

- **An edit that moves more than it named is now asked about**, not refused.
  `this would also change 1 cell it did not name` comes with *Apply it anyway*,
  the count, and the cells — and the reader decides. The checker has answered
  three ways since it landed (ADR-009); the write path had been treating the
  middle one as the last.
- **It needed no new message.** A confirmation is an *answer to a question about
  an edit*, which is what the choices list already is, so it arrives as one more
  choice. What it carries is the gesture, not the text: saying yes runs the same
  gesture again with the surprises accepted, so what lands is worked out from
  the file as it stands rather than from a copy held while the question was
  open — the rule the candidates already followed.
- **No override beside it**, because that is not the question being asked.
- The case in the tests is the one a real spec has: a parameter that decides how
  far a `formulas:` range reaches, so changing it writes a cell the parameter
  itself never touched.

### 2026-08-16 — Phase 7: the row that reaches out of the spec

- **A cell whose value is a field of a CSV can be edited**, and what changes is
  that field: the file comes back with the field's own bytes replaced and every
  other byte where it was — the promise the CST keeps for a spec, kept one file
  over by arithmetic rather than by a serializer.
- **The quoting is the type.** A CSV carries none of its own, so what the reader
  typed decides it: a number goes in bare, text that looks like a number goes in
  quoted, and a value holding a comma or a quote is quoted the way RFC 4180 says
  (`docs/spec.md` §9). The writer round-trips through the reader beside it, in a
  test that pins exactly that.
- **The checker grew a second door, not a second lock.** A companion file has no
  patch algebra, so what the intent carries is the file as it should be —
  `checkedText` compiles the spec with it overlaid and diffs, which is what
  `checked` was already doing after the patch step. One `Intent` kind (`wrote`)
  and one branch in the write path; the gate is unchanged (ADR-009).
- **The undo is the shell's**, and says so: `Checked.back` is `null` for a file
  this algebra does not address. VS Code's own undo takes a `WorkspaceEdit`
  back, which is the whole of what a CSV needs.
- **JSON is refused, with the reason.** Putting a value back into a JSON
  document without reformatting the rest needs the span-keeping treatment the
  CST gives YAML; reformatting somebody's data file to change one number is not
  a trade this project makes.
- Tier 4 follows it into the workbook: `Masters!B2` typed, `stores.csv` changed
  in one field, and the built `.xlsx` holding the new store name. 15 new tests,
  1124 in total.
- **The preview watches what it read, not what it can name.** A CSV is a file
  the spec is *made of* and has no node in it, so the rule that asked "does any
  node of the drawing live in this file?" said no and the grid kept the old
  value. The redraw now records every file the reader answered for while
  drawing — the spec, its `$include`s, and its data files — and watches that.
  `knows` was the old rule and is gone with it.
- A space *inside* a field needs no quotes and does not get them; one at either
  end does, because that is what half the readers in the world trim.

### 2026-08-16 — Phase 7: the parameter row, and what a parameter reaches

- **A cell that is exactly one placeholder can change the parameter behind it**,
  with the count of every cell that follows. `"${quarter} ${region}"` is not
  offered: typing `Q4 EMEA` over it would have to be split back across two
  parameters, and which half went where is the guess this editor does not make
  (ADR-001).
- **Nor is it offered while the preview is showing that parameter as something
  else.** The panel's setting changes what is drawn without changing a byte, so
  changing the default underneath it would leave the grid exactly as it was —
  an edit that appears to do nothing, which is the worst answer available (§1).
- **A parameter now reaches what it actually reaches.** `reaches` knew about
  cells and definitions and answered *nothing* for a parameter declaration, so
  the count would have been wrong and the inspector lit nothing up. A `param`
  origin carries where each of its parameters is declared — **and everything
  those defaults are built from**: `title: "${quarter} ${region}"` means a cell
  reading `title` follows `quarter`, transitively, which is the rule the spec
  states (`docs/spec.md` §7) and the one the verification loop needs to agree
  with. Tier 4 found this: the checker refused the edit because the title moved
  and the claim had not named it.
- The resolver takes one context now rather than four arguments, because this
  row needed a fifth — what the reader is *looking* at, which is not what the
  file says.

### 2026-08-16 — Phase 7: the definition row, which is what the phase is for

- **A cell that reads a `defs.values` entry can be edited now**, and it is the
  row `mediated` write-back exists to answer: *change `tax_rate`, which every
  cell reading it follows* — with the count — or *write `B4` as a value of its
  own, leaving the definition alone*.
- **Both are always offered.** One moves forty cells and the other moves one,
  and nothing but the reader knows which they meant (ADR-001). This is the row
  where `Candidate.alone` earns its keep by staying `false`.
- **Detaching keeps what the cell says beside the reference.** `B2: { value:
  { $ref: tax_rate }, format: "0.0%" }` loses its `$ref` and keeps its format,
  because what is written over is the node holding the reference and not the
  cell.
- **The edit lands in whichever file wrote the thing being changed.** Tier 4
  proves it over yxl's `workbook.yxl.yaml`: the cell is in
  `sheets/summary.yaml`, the definition in `defs.yaml`, and the reader opened
  neither. The tier now copies the whole cookbook rather than one file, which
  is what a spec assembled from `$include` needs.
- The workbook keeps the sharing: `target_revenue` comes back as a defined name
  Excel holds, with `B17` reading it. 8 new tests, 1097 in total.
- **The preview was reading one file from the editor and the rest from the
  disk.** Two defects, one symptom — the definition changed and the grid kept
  showing the old number:
  1. it redrew on a change to the document that was *opened* and on a *save* of
     anything else, and a `WorkspaceEdit` leaves the buffer dirty with no save
     ever coming. It now redraws for a change to **any file the spec is made
     of**, which is what `knows` already answered for the cursor.
  2. the redraw took the opened document's text from its buffer and every
     `$include`d file from `node:fs`. So even once it fired, it drew the disk's
     copy. Every file now answers with what the editor holds where it holds
     anything — for the drawing *and* for the verification loop, which was
     otherwise checking the next edit against a file the reader had already
     changed.
  The composition is a function (`openFirst`) with the editor injected, so the
  part that can be tested without VS Code is.
- **Swept before merging** (`AGENTS.md` §8). The rule *the buffer where there is
  one, the file otherwise* had ended up written twice in `preview.ts`, once as a
  reader and once as a lookup, with the reader rebuilt on every call. It is one
  named reader now. And `preview.ts` — the largest file in the tree at 437 lines
  — was carrying a half that is not about previews: reading a document, writing
  one, and revealing a span. Those moved to `documents.ts`, which is *the
  editor's files* beside `files.ts`'s *the disk*, and the preview is 381 lines
  about a panel and the messages it answers.
  Left alone: `resolve.ts` at 283 lines is the resolution table with a function
  per row, and splitting it per row would scatter the table. Revisit at five
  rows.

### 2026-08-16 — The roadmap re-cut around the day's work, not the architecture's

The direction was stated as a projection with edits on top. It is now stated as
what it has to be able to *do*, because a reader asked the only question that
matters — whether their ordinary day fits in it — and the answer was spread over
seven phases in the order the engineering wanted rather than the order a day
needs.

- **§1 says what "good enough to work in" means.** Every gesture already in a
  reader's hands has to work or say why not; a gesture that silently does
  nothing is the worst answer available, and one that asks about something with
  a single answer is the second worst. Nothing above it softens: the grid is
  still a projection, an edit with one meaning still applies, and the spec still
  gets no worse. What grows is the vocabulary those rules cover.
- **§6 opens with the everyday gestures as a table**, ✅ or a phase against each,
  which is the list to read when the question is "can I work in this?" — and is
  the list the phase order is now derived from.
- **Two new phases, and three renumbered.** Phase 8 is the grid as a spreadsheet
  (range selection, `Cmd`+arrow, copy, paste from Excel, delete a range, find);
  Phase 9 is a look you can apply (the toolbar, through the normalizer, plus
  widths and `freeze:`); structural edits move to 10; Phase 11 is what sits on
  the sheet — charts, images, sparklines — which the preview draws nothing of
  today and which is its largest hole. Refactors, the assistant and the Tauri
  shell keep their content and become 12, 13 and 14.
- **ADR-028** — the clipboard is a spec edit, in TSV *and* HTML, because that is
  the pair Excel and Sheets use to talk to each other; and a paste is one
  resolution over a rectangle, never six hundred questions.
- **ADR-029** — what the preview draws of a chart is a sketch: where it sits and
  what it is, never Excel's rendering of it, and nothing drawn is ever read
  back. ADR-014's rule, applied to pixels.
- **Four questions and two risks** the ambition creates: what shape a paste
  lands in, how much of the clipboard's HTML is readable, what draws a chart's
  outline without a new dependency, and what *one* question about a mixed
  rectangle looks like. The risks are the size of a paste, and the word
  "replaces" being heard as a promise — which the gesture table exists to
  answer with a list instead of an adjective.

### 2026-08-16 — Refactoring pass after the write gestures (`AGENTS.md` §8)
Walked the lenses in order over what the last three changes left. Nothing was
broken; four things were said in more than one place, which is how they come to
disagree.

- **What a reader's text means was decided in four places** — `write`,
  `writeOverride`, and twice inside the resolutions — each spelling out the
  leading `=`, the empty box, and YAML's reading of a bare scalar. `meaning()`
  in `intent` now answers once, in three cases, and everything reads it. A rule
  about what a keystroke means, applied in two places, is a rule that will be
  applied two ways.
- **Five copies of "find the sheet by name"** across `intent` and `extension`.
  `sheetOf` belongs to the package that owns the grid, and does now.
- **`cst/entries.ts` was two subjects again** at 489 lines: entries as *lines*
  — comments above, blank lines under, indentation — and entries as *text
  between brackets*, which has none of those. The flow surgery moved to
  `flow.ts`.
- **`Found.add` was an optional boolean** read as `!found.add`, and the thing it
  says — whether the write puts in a key the cell has not got — is now said on
  the type it belongs to, once, and required. `Found` itself stopped being
  exported: what the package shares is `located`, not its result type.
- §4.4's `empty` row said the gesture has two answers. It has one where the
  spec already wrote the cell, which is what the last change made true and the
  table had not caught up with.
- New seams got their own tests: `meaning` over the five readings, `sheetOf`
  over both answers.

### 2026-08-16 — Phase 7: typing into an empty cell, and one place for both offers

*Amended the same day, after a reader asked whether every edit would now cost a
click. It should not, and ADR-001 always said so: an edit with **one** meaning
applies, and only an edit with several is a question.*

- **A sole answer is taken rather than offered.** Typing into a blank cell just
  writes it, as in any spreadsheet. The question comes back the moment there is
  something to weigh it against — a `data:` rectangle directly above or to the
  left, whose second answer is to extend it — and a range's formula is always a
  question, because changing five hundred cells is not a thing to do quietly.
  `Candidate.alone` is where a row says which it is.
- **The grid moves under the keys**: arrows, tab and shift-tab, page up and
  down, all clamped to the sheet. Off the edge of the drawn window the host is
  asked for a window around where the reader went, and the redraw puts the focus
  back — but only if the grid had it, so the text editor beside is never robbed.
- **Delete empties a cell**, and emptying one *takes the entry out*. Writing
  `A7:` with nothing under it looked like the obvious thing and is a spec the
  compiler refuses: a cell needs at least one of `value`, `formula`, `rich`,
  `style`, or `format` (`docs/spec.md` §3). So the entry goes — except for what
  the cell *wears*: `{ value: 1, style: header }` keeps its style and loses its
  value, which is what a spreadsheet leaves behind. A field of a `data:` block
  is the format's own exception: `null` in a row is a blank cell (§9), so there
  the ordinary write says it.
- **A flow collection can have an entry taken out of it now.** `{ value: 0.085,
  format: "0.0%" }` is how the spec's own documentation writes an expanded cell,
  so refusing to touch it refused the common case. There are no lines to remove
  inside one, so what goes is the entry and one separator — the comma after it,
  or the comma before where it is the last — and the rest of the collection is
  the file's own bytes on either side of the cut. The undo writes the
  collection back as it was, which is byte-exact by construction.
- **A cell written for its format alone can be typed into.** Emptying `B4:
  { value: 0.085, format: "0.0%" }` leaves `{ format: "0.0%" }` — still a cell
  (`docs/spec.md` §3), and typing `0.01` into it was refused as *mediated* and
  offered an override, which is the wrong answer to an edit with one place to
  go. The `value:` key is now written into the cell that has not got one, above
  whatever is there, which is the order the spec's own examples use. `empty`
  origins carry the node they were not written at, so the badge and the write
  agree: a cell there is `direct`, and no cell at all still asks.
- **A flow collection's span had stopped at its last member**, leaving the
  bracket that closes it outside the node it closes. Correct for a block
  collection, where the span deliberately stops short of the comments that
  follow; wrong here, and it is what made the first attempt at the cut leave a
  stray `}` behind.

- **An address nothing reaches can be written now.** Typing into a blank cell
  offers it as a new `cells:` entry — the `empty` row's first answer — with the
  `cells:` key written too where the sheet has none. A formula goes in as
  `A5:\n  formula: …` and a value as `A5: …`, which is the shape each has in the
  spec (`docs/spec.md` §3).
- **It is offered rather than taken**, even though it is the only answer today:
  a blank cell beside a `data:` rectangle has a second one waiting — extending
  the rectangle — and doing the first silently would be picking between them.
- **No override beside it**, because an override must have something to override
  (`docs/spec.md` §23), and an empty address has nothing. The refusal now says
  `nothing writes A5 yet` rather than sounding like a mistake.
- **A refusal's two offers came apart.** The answers used to ride on the
  override's presence — a refusal with no cell to except carried no answer
  either, which is exactly the empty cell's case. `Refused` now carries what was
  typed once, with `choices` and `canOverride` beside it.
- `meant` — what a reader's text means as a YAML scalar — moved down into
  `intent`, where the direct path and the resolutions both read one rule.

### 2026-08-16 — Phase 7: the first row of the resolution table, and the way to choose

- **A cell filled by a `formulas:` range can be edited now** — by changing the
  range's own formula. The refusal that used to be the end of it now carries the
  answers the edit has, each saying what it would move: *Change the formula of
  the range at C2 — 2 cells (C2, C3)*. Pick one and it is written; pick none and
  nothing happens. The editor enumerates, the reader chooses (ADR-001).
- **Offered at the range's anchor only**, which is a decision rather than a
  gap. What a reader types is written *for the cell they typed it into*, and
  `=B3*0.1` one row down means `B2*0.1` to the range; shifting it back is
  reference translation (§8 Q2), and offering it without would be the editor
  guessing at an answer off by a row. Everywhere else in the range the refusal
  now points at the anchor, and the override is still there.
- **The candidates are worked out again when one is taken**, not remembered from
  when they were shown: the spec may have been edited by hand in between, and an
  answer computed against a file that has moved on is an answer to a question
  nobody asked.
- The claim a range edit makes is *every cell the range fills*, computed with
  the same `reaches` the inspector highlights with — so the checker's verdict
  and the number the reader was shown come from one place.
- Tier 4 follows it to the workbook: refused, resolved, built, and both cells of
  the range hold the new formula. 12 new tests, 1044 in total.

### 2026-08-16 — Refactoring pass at the Phase 6 boundary (`AGENTS.md` §8)
Walked the lenses in order over everything Phase 6 landed. No defects this time
— the corpus round trip found those while they were being written — so this was
tidying, and the largest piece of it was a file that had quietly become two.

- **`cst/apply.ts` was 573 lines and two subjects**: writing a scalar in place,
  and adding, removing and putting back the **entries** of a collection. Split
  at that line — `apply.ts` is 178 lines and keeps the dispatch, the splice, and
  the value ops; `entries.ts` holds the eight ops that change what a collection
  contains. The test file was split along the same seam.
- **Three unrelated functions were called `nodeAt`.** One is the node at a path
  (`cst`), one mints a node's identity (`loader`, now `identify`), one finds the
  node under a cursor (`extension`, now `nodeUnder`). A name that means three
  things costs a reader a lookup every time.
- **`removalOf` had no direct test** — only what `patch` exercised through it.
  Four now, including the reason it hands back when the lines could not go home.
- **§4.5 described an op algebra that never existed** (`delete`, `insertItem`,
  `csvSet`) and a `Patch` carrying its own claim, which moved to `Expects`
  beside it. Rewritten as the ops are, paired with their inverses.
- **Where undo actually happens is now written down.** The extension applies an
  edit as a `WorkspaceEdit`, so VS Code's own undo takes it back and a hand edit
  and a grid edit share one stack; `patch`'s `History` is the same algebra for a
  shell without one (Phase 11) and is wired to nothing today. It was true and
  unsaid, which is the state a reader trips over.
- Comment hygiene: a `§11` pointing at this changelog, a `(§1)`, and two `§n`s
  that named no document; a phase code narrating what Phase 2 could not do; a
  sentence in `editabilityOf`'s doc that had lost its full stop.
- Considered and left alone: `rowAt` / `columnAt` are exported and used only by
  `wanted` and their own tests, which §8.2 calls a smell — but a scroll position
  under row 21 clamps to the first window, so testing them through `wanted`
  would assert nothing. The direct test is the better one.

### 2026-08-16 — Phase 6 complete: the loop closes on a real workbook

- **Tier 4 is green**, which is the last box in Phase 6 and the first time the
  compiler runs for real rather than as a validator. A real spec is copied out
  of yxl's cookbook, edited through the same `write` the UI calls, built with
  the pinned `yxl`, and read back — so the question answered is not "did the
  file change" but "does the **workbook** hold what the reader typed".
- **`yxl extract` is how it looks inside the `.xlsx`** (`docs/spec.md` §22). The
  compiler already has a reader; what it writes back is a spec this editor can
  load, so the tier needs no spreadsheet library of its own and no ADR for one.
  It is a migration aid rather than a mirror, which is enough to ask what a cell
  holds.
- Three edits are followed the whole way: a **value**; a **formula**, which has
  to arrive as a formula and not as the number it stood for (ADR-014); and an
  **override** over a cell a `formulas:` range filled, where the assertion is
  both that the exception took and that the range around it still holds its own
  formula.
- The write path was already testable without an editor around it (ADR-004), so
  this tier needed a filesystem `Port` and nothing else — the seam that made
  `write.ts` unit-testable is the seam that made it end-to-end testable.

### 2026-08-16 — Phase 6: an entry taken out comes back as it was

- **A removal now has an inverse whatever the entry held** (**ADR-027**). The
  new op puts back the *lines* rather than a value, so a cell written in its
  expanded form — a mapping under the key — comes back whole, and so does a
  quoting that `add` used to re-render away: `'007'` was coming back as `007`.
- **A removal takes the comment block above it with it.** A comment describes
  the entry under it; left behind, it lands on whatever follows and now says
  something false. The blank line under the entry goes too, so removing one
  leaves one gap and not two.
- **Two layouts are refused rather than reversed**, both about lines that stay
  behind: a last entry with a blank line above it, and the only entry of a
  collection, which would have nothing left to be put back beside.
- **Two defects the corpus found while proving it.** Removing the entry written
  on a `- ` line took the dash with it and left the rest of the mapping
  dangling — now refused, since moving the dash is a structural edit. And a
  removal whose value was a block scalar swallowed the *next* entry's line,
  because a block body ends where the next line begins.
- Tier 2 grew the test that found them: every entry of every corpus spec,
  removed one at a time, either comes back byte for byte or is never removed —
  525 removals undone across the corpus. 46 new tests, 1020 in total.

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
