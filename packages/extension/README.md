# yxl — the grid beside the spec

A spreadsheet grid for [`yxl`](https://github.com/t-ujiie-g/yxl) specs. Open a
`*.yxl.yaml` and this draws it as a sheet next to its text, redrawing as you
type; edit the grid and **the YAML changes** — in the smallest diff that says
what you did, with your comments, key order and quoting intact.

## What it does

- **Draws the spec as a sheet.** Values, formulas and every look a style
  declares; merges, bands, an outline, frozen panes, conditional formatting,
  filters, notes, links, validations and tables; and what sits *on* a sheet —
  charts, images, shapes and sparklines — drawn where they sit and at the size
  they take.
- **Computes for display.** Some 500 Excel functions, `#DIV/0!` and the rest of
  Excel's error text included. A formula naming something this does not model is
  **not computed at all** and says so: a number that is not the workbook's number
  is worse than no number. Nothing computed is ever written back.
- **Edits, where the answer is one thing.** Type into a cell, apply a look from
  the toolbar, insert and delete rows and columns, merge, fill, sort, size a
  column, hide a run, rename a sheet — and the YAML changes.
- **Refuses the rest out loud, and offers the answers it has.** A cell whose
  value comes from a definition, a CSV, a parameter or a `formulas:` range has
  more than one meaning or none. It says so before you type, and when you type
  anyway it lists what each answer would change — *change the range's formula*,
  which moves 40 cells, or *split the range* — with the count beside it. You
  pick; nothing is picked for you.
- **Tidies the spec, where that provably changes nothing.** A look written out
  in full at three places or more becomes one `defs.styles` entry you name;
  definitions that resolve alike become one, and you pick which name survives; a
  column of cells each translating one formula becomes the `formulas:` range
  that fills them. Every one of them **is refused automatically if it would
  change a single rendered cell**, and none of them is applied silently — you
  see the diff first.
- **Reads in English and 日本語**, following VS Code's own display language.

## What you need

The **`yxl` compiler**, on your `PATH` or named by the `yxl.path` setting. It is
required rather than bundled: it is what builds the workbook, and you likely
have it already.

This release targets **yxl 0.3.6**. An older or a newer compiler is a warning
rather than a refusal — a spec written here is ordinary yxl — but the schema is
not frozen until yxl's v1.0, so the pinned version is the one this was tested
against.

## Getting started

- **New File…** → *A yxl Spec: an Empty Workbook* — or right-click a folder.
  This runs `yxl init`, so the starter is the compiler's, not this editor's.
- Open any `*.yxl.yaml` and press the **grid** button in the editor's title bar,
  or run **yxl: Open the Grid Beside the Spec**.
- **Build** and **Check** sit beside it, on both the text and the grid.
- **yxl: Gather Repeated Looks into a Definition** reads the whole spec and
  offers what it can tidy without changing the workbook.

## What it is not

A spreadsheet application with a YAML export. That is a different product, and
the difference decides every call here: **the text is the truth, and the grid is
the projection.** If you are editing a workbook in Excel and want the spec to
follow, this is not the tool — `yxl extract` is the one-way bridge.

It is also not a renderer: Excel opens the result. `yxl build` produces the
`.xlsx`; this extension never writes one.

The gestures it does not have yet are listed as plainly as the ones it does, in
the repository's [`ROADMAP.md`](https://github.com/t-ujiie-g/yxl-vscode/blob/main/ROADMAP.md).

## What it collects

Nothing. No telemetry, no analytics, no network request of its own. It reads the
files your spec names and runs the `yxl` you point it at, and that is all.

## Licence

Apache-2.0, matching `yxl`.
