# yxl-vscode

**An Excel-like editor for [`yxl`](https://github.com/t-ujiie-g/yxl) specs.**
A VS Code custom editor that renders a `*.yxl.yaml` spec as a spreadsheet grid,
and translates grid gestures back into edits on the spec — not into a workbook.

> ⚠️ **Status: planning.** There is no code yet. `ROADMAP.md` holds the design
> and the phase plan; the first release is Phase 4 (read-only preview).

`yxl` made a workbook into version-controllable text. This makes that text
direct-manipulable without giving up what made it text:

- **Click a cell, and the YAML changes** — in the smallest diff that expresses
  what you did, with your comments, key order, and formatting intact.
- **See where everything came from.** Select a cell and the inspector says *this
  is bold because `defs.styles.header` says so, blue because column B's band says
  so, and its value came from row 12 of `sales.csv`.*
- **It never guesses.** Where an edit maps to exactly one change in the spec it
  applies silently. Where it maps to several — change the shared style, or fork
  it for this range? — it asks, and shows how many cells each answer would move.
- **The spec doesn't degrade.** Every write passes a style normalizer that
  prefers reusing a definition over creating one, and a verification loop that
  refuses any change touching cells the edit didn't name. A spec written by
  clicking is structurally indistinguishable from one written by hand — which is
  the point: an AI agent editing the YAML and a person editing the grid converge
  on the same file.

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
