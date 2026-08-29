# Changelog

Every release names the `yxl` it was built against: the schema is not frozen
until yxl's v1.0, so the pinned compiler is part of what a version means
(`ROADMAP.md` §8 Q6).

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
