# Changelog

Every release names the `yxl` it was built against: the schema is not frozen
until yxl's v1.0, so the pinned compiler is part of what a version means
(`ROADMAP.md` §8 Q6).

## Unreleased

Targets **yxl 0.7.2**, which this moves to from 0.7.1. It builds the same
workbook from the same spec; an older yxl is offered the update, as before.

- **A long sheet scrolls without redrawing at every row.** Near column A, or
  near row 1 scrolling sideways, each scroll rebuilt the whole grid.
- **A row keeps its height whichever columns are on screen.** A row is fitted
  to its tallest cell anywhere along it, as Excel fits a row without a height,
  and Japanese text no longer makes a row taller than its 15pt.
- **`Cmd`+`↓` and the other jumps arrive where they go**, and stop below the
  headings and frozen panes rather than under them.

## 0.5.0 — 2026-10-19

Targets **yxl 0.7.1**, which this release moves to from 0.6.2: an older yxl is
offered the update, as before.

### yxl 0.7

- **Every layout key yxl 0.7 adds is drawn as yxl builds it.** A layout's
  `title`, a `header_style` per header row, `body_style` on a layout and on a
  column, a column's `type`, `merge_equal` and `page_break_on`. A header
  without merges keeps each group's outline, as yxl 0.7 now draws it. Such a
  spec no longer shows an error in the preview.
- **The sheet's own keys may name a layout.** `freeze: { layout, columns }`,
  `filter:` over a layout with criteria by column name, `print.area` and the
  new `print.titles`, and a `rows:` band over a layout's title, header, body
  or footer all follow the layout. Putting a row or a column in, or taking one
  out, leaves them written as they are.
- **A cell found by meaning reaches further.** An override, and now a note or
  a link written in the new list form, may name a header row, a footer row
  (`footer: last` included) or the title. A cell a merge covers is refused, as
  yxl refuses it. Adding or changing a note or a link from the grid is refused
  on a sheet that lists them, with a reason, rather than written in the wrong
  shape.
- **A `formulas:` range may carry `style` and `format`**, and every cell of it
  shows them.

### Fixes

- **A merged cell across the freeze line scrolls as Excel's does.** Its part in
  the frozen columns stays, and the rest scrolls with the sheet; it used to stay
  whole and run past the columns it covers. A layout's `title` under
  `freeze: { layout, columns }` is where this showed.
- **A later look replaces an earlier one, as the workbook does.** A `cells:`
  entry or an override that gives a `style` or a `format` over a cell another
  construct wrote now shows only its own look over the bands; the grid used to
  keep the earlier look too. yxl 0.7.1 builds an override the same way, the
  bands under it included.

## 0.4.1 — 2026-10-15

Targets **yxl 0.6.2**, which this release moves to from 0.6.1: an older yxl is
offered the update, as before.

- **A layout header without merged cells is drawn as yxl builds it.** yxl
  0.6.2 adds `header_merge: false` to a layout. Such a spec no longer shows an
  error in the preview: the header has the same cells and look, with no merged
  range.

## 0.4.0 — 2026-10-15

Targets **yxl 0.6.1**, which this release moves to from 0.5.1: an older yxl is
offered the update, as before.

### yxl 0.6

- **A filter with saved criteria is read and kept.** yxl 0.6 lets `filter:`
  carry the criteria Excel's dropdowns show ticked (`at:` and `columns:`).
  Such a spec no longer shows an error in the preview; a filtered header says
  on hover what is saved for its column. Putting a row or a column in, or
  taking one out, moves each criterion's column with the rest, and drops the
  criterion whose column goes. Putting a new filter over one with criteria is
  refused, since it would lose them; taking it off still works.
- **Build writes the workbook where the spec says.** yxl 0.6 lets a spec name
  its `output:`. *Build* no longer passes its own `-o`, so the workbook goes
  where `output:` points — or beside the spec, as before — and *Open it* opens
  the file the compiler wrote.

### Frozen panes

- **A frozen column or row inside a table no longer shows what scrolls under
  it.** A table's header row and stripes were drawn see-through, so with the
  panes frozen over a table the text of the cells scrolling past showed through
  the frozen ones. They look the same and hide what passes beneath.
- **Charts, images and shapes stay in their own pane.** One in the scrolling
  part of the sheet slid over the frozen columns as you scrolled sideways; it
  now goes under them, as it goes under the frozen rows. One placed in a frozen
  pane stays there, as Excel keeps it.
- **The print area and page breaks are drawn in every pane.** The outline and
  a break's line slid over the frozen columns too; each pane now shows its own
  part, and a column break runs the whole height of the sheet rather than
  stopping at the bottom of the window.
- **Frozen columns and rows hold still while you scroll.** A scroll that ran
  past the end of the grid carried on into the page, or bounced on a Mac
  trackpad, and took the frozen panes with it; it now stops at the grid's edge.
  A chart, image, shape or print line in a frozen pane no longer bobs a little
  behind the scroll.
- **The corner above the row numbers stays clear.** On a sheet with grouped
  rows, the headings scrolling left showed through the strip beside the
  corner.

## 0.3.0 — 2026-10-11

Targets **yxl 0.5.1**, as 0.2.5 did. Every issue reported against 0.2.5, in one
release; 0.2.6 to 0.2.9 were numbered along the way and never published.

### Edits no longer save a spec yxl will not build

- **Text with a comma, bracket or brace is quoted when it is written** (#203).
  Typing `x]` into a cell written as `{ value: …, style: … }` or into a `data:`
  row saved a file `yxl build` could not read; typing `a, b` there was refused
  with a reason that made no sense.
- **A spec that is not valid YAML says so** (#204). A stray bracket or an
  unterminated quote was passed over in silence, and the preview drew what it
  could recover; it is now reported, and an edit that would leave the file
  like that is refused.
- **Filling formulas down or right as one range no longer leaves the first
  cell behind** (#216). The cell is replaced by the range; a cell that also has
  a style or a format is filled a cell each instead, so its look is not lost.
- **Renaming a sheet updates every reference to it** (#207): links, drop-down
  lists read from a range, conditional rules, chart ranges and sparklines as
  well as formulas, and both ends of a 3D reference such as
  `Sales:Summary!A1`. It no longer strips the quotes from another sheet's name
  in a formula. **Deleting a sheet is refused while any of those still names
  it.**
- **Gathering definitions that say the same thing updates every place they are
  named** (#217): bands, conditional formats, overrides, layouts and other
  definitions' `extends:`, not only cells. A set that cannot be gathered safely
  is no longer offered, and a refused tidy-up says why in words. The command
  — "Gather Repeated Looks into a Definition" — now appears in the command
  palette when a spec is open, not only while the preview has focus.

### Rows and columns put in or taken out move everything

- **Everything that names a place moves with the line** (#206): notes, links,
  conditional formats, drop-down lists, the filter, the print area and page
  breaks, tables, charts, images, shapes, sparklines, layouts and overrides —
  and formulas on other sheets and in `defs.formulas` that point into the
  sheet. Before, only the cells moved.
- **No more refusals with reasons that did not fit**, on a sheet with an
  override, a cell whose formula is a `$ref`, only layouts (#206), or a `data:`
  table whose first row or column is all blank (#215). A line through a layout,
  or one that would take a table's header row, is refused with that reason.
- **Putting a row in above a layout no longer asks first** because of the
  formulas the layout draws: only what the edit writes is counted.
- **Sorting Z to A leaves blank cells at the bottom**, as Excel does (#215).

### The preview shows what Excel and yxl show

- **Numbers with no format show as Excel's General** (#209): `=1/3` is
  `0.333333333`, not sixteen digits.
- **Dates in a `date1904: true` workbook show the right day** (#210); they
  were four years and a day early.
- **Japanese era and weekday formats** (#211): `ggge"年"m"月"d"日"` shows
  `令和8年10月7日`, and `aaa` shows `水`.
- **Smaller differences from Excel** (#213): `TRUE`/`FALSE` in capitals, an
  error value centred, a format's text section applied to text, underline and
  strikethrough together, and a conditional format comparing `"1"` no longer
  matching the number 1.
- **Where two column or row bands overlap, the preview shows what yxl builds**
  (#208): the later band's style replaces the earlier one rather than adding
  to it, and a width set by one band survives a later band that only hides
  the column.
- **Borders between neighbouring cells are one line on the gridline** (#212),
  not two lines either side of it.
- **The print area, page breaks, charts, images and shapes stay on their rows
  below a row that has grown to fit wrapped text** (#219).
- **The preview reports what `yxl build` refuses** that it used to pass over: a
  formula range over a cell the sheet writes or over another range (#216), and
  a link, list, chart or sparkline naming a sheet the spec does not have
  (#207).

### Typing and moving

- **`0x1F`, `0o17` and `0b101` typed into a cell stay as you typed them**
  (#205); they were written as the numbers 31, 15 and 5. `TRUE` and `FALSE`
  are truth values whatever their case, as in Excel.
- **Arrow keys and Tab move as in Excel** (#218): through a merged cell in one
  step, and over hidden rows and columns.
- **The preview follows a CSV, JSON or `$include` file changed outside VS
  Code** (#214) — by a script, `git pull` or a checkout — including one that
  is deleted and comes back.

## 0.2.5 — 2026-10-08

Targets **yxl 0.5.1**, as 0.2.4 did.

- **A merge stays drawn when its top-left cell is scrolled out of view**
  (#198). A wide heading disappeared as soon as the reader scrolled right of
  its first column; a tall merge did the same scrolling down. The part of the
  merge on screen is now drawn, and its text sits where Excel puts it in the
  whole merge.
- **A `formula:` conditional rule applies to blank cells** (#199). It was only
  ever applied to cells holding something, so a rule like `formula: "TRUE"`
  drawing a table's borders left an empty template bare.
- **A number format's colours are drawn** (#200): `[Red]`, `[Blue]` and the rest,
  so a negative number under `#,##0;[Red]-#,##0` is red.
- **Numbers and dates are right-aligned, and truth values and errors centred,
  where a cell sets no alignment** (#201), as in Excel. A number no longer runs
  over the empty cells beside it.

## 0.2.4 — 2026-09-30

Targets **yxl 0.5.1**, as 0.2.3 did.

- **A wrapped merged cell no longer makes its row taller** (#196). Excel leaves
  merged cells out of fitting a row's height, so a row with no declared height
  stays one line tall and the rest of a merged heading is cut. The preview grew
  the row to show every line, and so showed more than Excel does. It now cuts
  the text where Excel does. A cell that is not merged still grows its row, as
  in Excel.

## 0.2.3 — 2026-09-29

Targets **yxl 0.5.1**, as 0.2.2 did.

- **A merge over a hidden row or column no longer pushes the cells beside it
  along** (#194). A footer label merged across a hidden key column drew every
  cell right of it one column over, under the wrong heading; a merge down
  across a hidden row did the same to the rows below. A merge now spans only
  the rows and columns that are shown.
- **A merge whose top-left cell is hidden still shows.** It is drawn from the
  first of its cells that is shown, with the top-left cell's value, as Excel
  draws it — where the whole merge used to disappear.

## 0.2.2 — 2026-09-24

Targets **yxl 0.5.1**, up from 0.5.0.

- **A footer's groups sort as yxl 0.5.1 sorts them.** `order: asc` and `desc`
  put text in code-point order — `aa` before `b` — where 0.5.0 put shorter text
  first. The preview follows the compiler, so it moves with it.

- **Column widths hold on a sheet with a column group** (#191). A `group:` on
  any column put its outline row first in the grid's heading, and that row
  carried no widths, so every column was drawn the same width.
- **Text spilling across frozen columns reads whole** (#191). A long title in a
  frozen column was cut up by the frozen cells beside it, text from a scrolling
  column showed through the frozen ones, and the outline row over frozen
  columns scrolled away. Text from a frozen column now stops at the freeze line,
  as Excel's panes do.
- **A group's − and + are the size Google Sheets draws them.** 16px rather than
  9, with a bracket through the middle of the outline gutter that ends at the
  button. A collapsed group's + sits at the seam where its columns were hidden,
  and a nested group's bracket is drawn in its own row again, where it had
  slipped out of sight. With a group collapsed inside an open one, the outer
  group's − stays at the end of what is still shown.

## 0.2.1 — 2026-09-24

Still targets **yxl 0.5.0**.

- **Type into a layout's rows.** A cell a layout reads from `values:` takes
  the value in its own row. One it reads from a CSV offers the file, and writes
  the field under the header it was matched by — not the one at its position.
- **Drag a layout column wider.** The width lands in that column's own entry.
  A column placed from a block asks first, since its width is every
  placement's.
- **A layout's names compute.** `SUM(stores.cy)` and
  `INDEX(stores.name, MATCH(…))` show their values in the preview, where before
  a formula naming a layout was left uncomputed.
- A layout's header, footer and formula columns still refuse a value, and still
  take an override.

## 0.2.0 — 2026-09-23

Targets **yxl 0.5.0**, up from 0.4.0.

- **Layouts are drawn.** yxl 0.5.0's `layouts:` — columns named rather than
  lettered — appear in the grid as yxl builds them: header levels merged where
  neighbours agree, rows read from `values:`, a CSV or JSON by field name,
  `defs.blocks` placed as the columns they stand for, and footers with totals
  and grouped subtotals. A layout's name reaches it from elsewhere too: a
  chart's or a sparkline's data, a validation's list, a table, and anything
  anchored `below:` one.
- **A cell a layout draws says so** rather than taking a value: the layout is
  edited in its YAML. An override still excepts one cell, as it does anywhere.
- **Update yxl from the warning.** When the compiler is older than the one this
  release targets, or missing, the warning offers to run yxl's own installer for
  exactly that version, and checks the version again afterwards. It asks once
  after each update of this extension, and installs nothing unless you press
  the button.

## 0.1.2 — 2026-09-13

Targets **yxl 0.4.0**, up from 0.3.6.

- **Twelve shape geometries that yxl refused before.** `rounded_rectangle`,
  `right_triangle`, the six straight arrows, and the four callouts — a defect in
  the Excel backend lowercased their DrawingML token, and 0.4.0's backend keeps
  its case. Each is drawn in the grid as the outline it names.
- **A workbook's own `protect:` is carried through.** 0.4.0 writes it where
  Excel accepts it, so a spec may now hold one; this editor does not model it
  and leaves it exactly as written.
- A pivot's `filters:` axis, and a second pivot over a second source, are
  likewise carried untouched.

## 0.1.1 — 2026-08-31

Still targets **yxl 0.3.6**.

- **New: yxl: Gather Repeated Looks into a Definition.** Reads the whole spec
  and offers what analysis can see, never applying it silently:
  - a look written out in full at three places or more — on cells or on the
    `overrides:` beside them — becomes one `defs.styles` entry you name;
  - definitions that resolve to the same look become one, and you choose which
    of their names survives;
  - a column of cells each translating one formula becomes the `formulas:`
    range that fills them.
- Every one of those **claims to change no rendered cell, and is refused
  automatically if it would** — checked by compiling before and after and
  comparing. The proposal is shown as a diff in VS Code's own diff editor, and
  written only when you say so; `Cmd`+`Z` takes it back.

## 0.1.0 — 2026-08-30

The first published release. Targets **yxl 0.3.6**.

- The grid beside the spec: every construct `docs/spec.md` gives a sheet, drawn
  where the spec puts it, with provenance for every value and every look.
- Formulas computed for display, and never written back.
- Editing that writes the YAML: typing, the formatting toolbar, rows and
  columns, merges, fills, sorting, sizing, hiding, the outline, the tab bar,
  notes, links, validations, tables, charts and images.
- Refusals that name the reason and offer the answers, with the count of what
  each would move.
- English and 日本語, following VS Code's display language.
- **New File… → A yxl Spec: an Empty Workbook**, which runs `yxl init`.
