# Changelog

Every release names the `yxl` it was built against: the schema is not frozen
until yxl's v1.0, so the pinned compiler is part of what a version means
(`ROADMAP.md` §8 Q6).

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
