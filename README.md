# yxl-vscode

**An Excel-like editor for [`yxl`](https://github.com/t-ujiie-g/yxl) specs.**
A VS Code extension that renders a `*.yxl.yaml` spec as a spreadsheet grid
beside its text, and will translate grid gestures back into edits on the spec —
not into a workbook.

> ⚠️ **Status: the read-only preview is complete; nothing writes yet.**
> *yxl: Open Preview to the Side* draws a spec as a grid next to the text and
> redraws it as you type. Under it: YAML parses into a span-carrying tree, edits
> apply as minimal byte patches that leave every untouched byte alone, a whole
> spec — `$include`, `csv:`, and all — reads into a model of itself, and that
> model projects to a grid where every value and every property of every look
> says which line of which file it came from. It is checked on every commit
> against the compiler that will build it. `ROADMAP.md` holds the design and the
> phase plan.

## What it does today

| | |
|---|---|
| **Draws** | Values, formulas as their own text, number formats, fonts, fills, borders, alignment, merges, column widths and row heights, hidden bands — for a spec assembled from `$include`, `csv:`, `json:`, `defs:`, `params:`, and `overrides:`. |
| **Explains** | Select a cell and the inspector says where each part of it came from — the definition, the band, the file — and takes you to that line. Put the cursor on a definition and the cells it reaches light up. |
| **Answers** | Turn a parameter in the preview and the whole spec redraws as that workbook, without touching the file. Problems the projection found are marked on the cell and listed under the grid. |
| **Does not evaluate** | A formula shows as a formula. No cell here holds a computed number, and none ever will be written back. |
| **Does not edit** | Nothing in the preview writes to the spec — that is the next phase. The text editor beside it is how you change a spec today. |

## Getting it

Not published yet. To run it from a checkout: `pnpm install`, then **F5** in VS
Code (*Run the preview*), which builds both bundles and opens an Extension
Development Host; open a `*.yxl.yaml` there and run **yxl: Open Preview to the
Side**.

The **Check** and **Build** commands need the `yxl` compiler on your `PATH`, or
`yxl.path` set to it; the preview itself needs nothing.

## Where it is going

`yxl` made a workbook into version-controllable text. This is to make that text
direct-manipulable without giving up what made it text:

- **Click a cell, and the YAML changes** — in the smallest diff that expresses
  what you did, with your comments, key order, and formatting intact.
- **It never guesses.** Where an edit maps to exactly one change in the spec it
  applies silently. Where it maps to several — change the shared style, or fork
  it for this range? — it asks, and shows how many cells each answer would move.
- **The spec doesn't degrade.** Every write passes a style normalizer that
  prefers reusing a definition over creating one, and a verification loop that
  refuses any change touching cells the edit didn't name. A spec written by
  clicking is structurally indistinguishable from one written by hand — which is
  the point: an AI agent editing the YAML and a person editing the grid converge
  on the same file.

Seeing where everything came from is the half that already works, and it is what
the rest is built on.

Excel still opens the result. `yxl build` still produces the `.xlsx`; this editor
never writes one.

## What it is not

A spreadsheet application with a YAML export. That is a different product, and
the difference decides every design call here: **the text is the truth, and the
grid is the projection.** If you are editing the workbook in Excel and want the
spec to follow, this is not the tool — see yxl's `yxl extract` for the one-way
bridge.

## Documentation

| | |
|---|---|
| Direction, design, phases, ADRs | [`ROADMAP.md`](./ROADMAP.md) |
| How to work in this repo | [`AGENTS.md`](./AGENTS.md) (= `CLAUDE.md`) |
| The spec format itself | [yxl `docs/spec.md`](https://github.com/t-ujiie-g/yxl/blob/main/docs/spec.md) — the authority, never restated here |

## Licence

Apache-2.0, matching `yxl`.
