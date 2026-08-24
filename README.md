# yxl-vscode

**An Excel-like editor for [`yxl`](https://github.com/t-ujiie-g/yxl) specs.**
A VS Code extension that renders a `*.yxl.yaml` spec as a spreadsheet grid
beside its text, and will translate grid gestures back into edits on the spec —
not into a workbook.

> ⚠️ **Status: the preview is complete, and the first edits write back.**
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
| **Draws** | Values, number formats, fonts, fills, borders, alignment, merges, column widths and row heights, hidden bands, mixed-font rich text — for a spec assembled from `$include`, `csv:`, `json:`, `defs:`, `params:`, and `overrides:`. |
| **Explains** | Select a cell and the inspector says where each part of it came from — the definition, the band, the file — and takes you to that line. Put the cursor on a definition and the cells it reaches light up. |
| **Answers** | Turn a parameter in the preview and the whole spec redraws as that workbook, without touching the file. Problems the projection found are marked on the cell and listed under the grid. |
| **Says what a selection comes to** | Select a rectangle and its count, sum and average are under the grid, over the values as computed — the number you can see is the number that is added. Taken on the host, because the grid is drawn a window and a whole-column selection reaches past it. |
| **Puts rows and columns in, and takes them out** | From the heading, over the run selected. Every construct the line reaches moves with it: a `cells:` key is renamed, a formula says the same thing from where it stands, a `data:` block opens a gap, a range and a merge take the line in, the freeze follows. What it would move is in front of you before it happens, and a formula naming a row a delete would take refuses the gesture rather than leaving `#REF!` behind. |
| **Merges cells, and takes them apart** | From the cell's own menu, over the rectangle selected. Lossless: Excel throws away every value but the top-left, and a spec keeps them — the merge only draws over them — so unmerging gives the sheet back exactly. |
| **Keeps a rectangle as a table** | `cells:` is keyed by address, so inserting a row rewrites every key below it. Select the rows, *make this a data table*, and the addresses live in one `at:` — each field taken as the file wrote it, so a quoted `"007"` is still text. The insert gesture points at this when the diff it would make is mostly cell keys. |
| **Fills down and right** | `Cmd`+`D` / `Cmd`+`R` over a selection. A formula can go in as **one `formulas:` range** — which is what Excel's own fill makes of one — or as a cell each with the references moved; you pick. |
| **Puts a table's rows in order** | Select the rows, sort by the column you started in. Each row is written where it goes exactly as it was written before, so the diff is the order of the lines and nothing else. |
| **Computes** | Formulas are evaluated for display — 500-odd Excel functions, `#DIV/0!` and the rest of Excel's error text included, and a `formulas:` range computed per cell the way Excel shifts a shared formula. A formula that names something this does not model (a table, a workbook-defined name) is **not computed at all**, and the sheet says so: a number that is not the workbook's number is worse than no number. |
| **Never writes a computed value** | What was computed is display-only and is kept apart from what the spec holds, everywhere, so no edit can ever be about it. |
| **Edits, where the answer is one thing** | Type into a cell — Enter, or just start typing, as in Sheets; `Alt`+`Enter` for a line break inside it, `Tab` and `Shift`+`Enter` to leave it the way you would anywhere else — and the YAML changes: the smallest possible diff, in whichever `$include`d file wrote that cell, with your comments and quoting untouched. Every write is checked by compiling before and after and comparing what moved against what the edit said it would move; an edit that cannot be undone is not made. |
| **Refuses the rest, out loud** | A value that comes from a definition, a CSV, a parameter, or a `formulas:` range has more than one answer or none. Those cells carry a grey corner mark and say so when selected — before you type, not after — and typing anyway gets the reason. |
| **…and offers the answers, where it has them** | Where an edit has one meaning it is made — typing into a blank cell writes it, and the arrows, tab and delete work as they do anywhere else. Where it has several, they are listed with what each would change: a formula typed into a `formulas:` range can become *the range's* formula — shifted to where the range keeps it — or split the range so that one cell holds its own, and you are told which of the two moves 40 cells before you agree to it. You pick; nothing is picked for you. |
| **Applies a look** | A toolbar over the grid: bold, italic, underline, strike, a fill, a text colour, both alignment axes, wrap, a number format, and a border on any edge — over a cell or a selection, each showing what the selected cell wears and each with a way to take it off again, including on a cell that reads it from a band. Bold, italic and underline are on `Cmd`/`Ctrl`+`B`, `I` and `U` as well. The font face and size, the quick number formats — percent, a decimal place more or fewer — and *clear formatting* are all in the bar. Colour, borders and freezing open the panel a reader of Sheets or Excel expects them in; the bar wraps rather than running off a narrow panel, so nothing is ever out of reach. What lands is the normalizer's answer: a declaration that already says it, a variant extending the one the cell wears, or the look itself — never a fourth anonymous copy of the same thing. |
| **Has the bar every spreadsheet has** | Above the grid: where you are, and what that cell *holds* — the formula, never what it computes to. Type into it and it is the same edit as typing into the cell, with the same answers. The corner takes the whole sheet. |
| **Selects a row or a column from its heading** | Click a heading and the whole run is selected; drag or `Shift`+click across several. A look asked for over whole columns is written as **one band** — through the same normalizer, so a declaration that already says it is reused — rather than as a cell entry per row. |
| **Draws and writes an outline** | `group:` shows in a gutter outside the headings, as both spreadsheets keep it — a row above them per level, a column left of the row numbers — with the bracket over the run and the control at its end. Collapsing writes it — `group` with `hidden: true` is what the schema calls a collapsed group — so what you see is what the file says, and the `+` that opens one is on the heading the run hides behind. |
| **Hides a row or a column** | Right-click a heading: hide what you have selected, or show back what is hidden. A hidden run is marked on the heading it sits behind — the only thing that says something is there — and the mark is the way back. It is written as `hidden:` on a band, and showing again takes the band away rather than leaving `hidden: false` behind. |
| **Sizes a column** | Drag the edge of a column or row heading — or **double-click it** and the column takes the width of its widest cell, measured in the font each one wears rather than counted in characters, which is the difference between a Japanese column that fits and one that does not. It is written as a `columns:` / `rows:` band in the units the spec keeps — never as a width on forty cells — and where the band it takes its size from covers more than the one you dragged, you are asked: change the band, or split it so that one stands alone with every other key it had. |
| **Freezes the panes** | A sheet's `freeze:` is honoured while you scroll — the rows above it and the columns left of it stay put wherever you are in the sheet, not only while the top of it is drawn — and the toolbar sets it at the cell you have selected or takes it off again. A sheet written with a `split:` is refused rather than rewritten: the two cannot be combined, and the split is not this editor's to remove. |
| **…and asks where a look comes from somewhere else** | Where it comes from a shared declaration or a column band, the answers are listed with the count of what each would move — change the declaration every cell reading it follows, change the band, or write it on these cells. Over a selection whose cells take it from different places, the two answers are apply it to all of them alike or change each place it comes from. Nothing is picked for you, and nothing is asked where both answers would leave the file the same. |
| **…and offers the exception** | Every refusal about a real cell carries `overrides:`, the exception yxl has for exactly this (`docs/spec.md` §23): say why, and the cell is written as one deliberate exception with your reason beside it, marked with a red corner ever after. Offered, never taken on its own. |

## Getting it

Not published yet. To run it from a checkout: `pnpm install`, then **F5** in VS
Code (*Run the preview*), which builds both bundles and opens an Extension
Development Host; open a `*.yxl.yaml` there and run **yxl: Open Preview to the
Side**.

The **Check** and **Build** commands need the `yxl` compiler on your `PATH`, or
`yxl.path` set to it; the preview itself needs nothing.

## What it is for

Reading a spec in a grid is worth having, and it is not the point. The point is
that on an ordinary day — open a workbook, paste a column out of a report, fix
three numbers, bold a heading, send it on — **this is where that happens**, and
the file that changed is still the YAML.

`ROADMAP.md` §6 opens with the list that answers *can I work in this yet?*: every
everyday gesture, with a ✅ or the phase it lands in. Typing, the arrows, `Tab`,
`Delete`, range selection, undo, and copy/cut/paste inside the grid are in, and
so is copying out — Google Sheets receives the whole look, Excel everything but
the cell fill (`ROADMAP.md` ADR-033) — and pasting *in*, which carries the
values and not yet the looks (ADR-034). Finding something in the
sheet and going to it are in. A rectangle that lands on cells written in several
different ways is answered a group at a time rather than refused whole. The
formatting toolbar is in, and so are inserting and deleting rows and columns,
merging, filling, sorting a block of rows, and the whole of the tab bar — adding,
renaming, deleting and reordering a sheet, hiding one, colouring its tab.
Conditional formatting is **applied in the grid** — every kind of rule, over the
computed values — and a sheet's auto filter is drawn and can be put on and taken
off. A cell's note wears Excel's red corner, shows what it says on hover, and
can be written, changed, or taken off from the cell's own menu, and so can a
link: a linked cell is drawn as one, `Cmd`+click follows it out to the page or
in to the cell it names, and which of the two a target is, is asked rather than
guessed. A `validations:` list offers its choices in the cell as a spreadsheet
does, the other kinds say what they will accept on hover, and *Data validation…*
writes a list over the selection. A `tables:` region is drawn as Excel bands
one, header row and all, and *Format as table* makes one over the selection.
What sits *on* a sheet rather than on its cells — charts, images, sparklines and
shapes — is carried through untouched and drawn as nothing, and is the phase in
progress.

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

The everyday spreadsheet gestures it does **not** have yet are listed as
plainly as the ones it does — the charts, images and sparklines a spec declares
are drawn by nothing yet, which is [`ROADMAP.md`](./ROADMAP.md) Phase 14.

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
