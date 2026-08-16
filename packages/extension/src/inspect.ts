import { dirname, relative } from 'node:path';
import { type CompiledSheet, cellAt, type FacetOrigin, styleAt } from '@yxl-vscode/compile';
import type { Sheet, SpecDoc, SpecNode } from '@yxl-vscode/spec';
import type { A1Addr, NodeId } from '@yxl-vscode/units';
import type { Source } from '@yxl-vscode/webview/protocol';

/** Where every facet of one cell came from, in a reader's words, with the place to go to. */
export function inspect(nodes: Nodes, sheet: CompiledSheet, at: A1Addr, from: string): Source[] {
  const cell = cellAt(sheet, at);
  const found: Source[] = [];

  if (cell !== null) {
    found.push(...facet(nodes, 'value', cell.provenance.value, from));
    if (cell.provenance.format !== null) {
      found.push(...facet(nodes, 'format', cell.provenance.format, from));
    }
  }

  // The last layer to give a leaf is the one the cell wears, so it replaces.
  const wears = new Map<string, Source>();
  for (const layer of styleAt(sheet, at)) {
    const where = nodes.get(layer.node);
    const said =
      layer.name === null ? through(layer.through, where) : `the style \`${layer.name}\``;

    for (const property of Object.keys(layer.gives)) {
      wears.set(property, { facet: property, says: said, ...sited(where) });
    }
  }

  const answered = new Set(found.map((one) => one.facet));
  for (const [property, source] of wears) {
    if (!answered.has(property)) found.push(source);
  }

  return found;
}

function facet(nodes: Nodes, name: string, origin: FacetOrigin, from: string): Source[] {
  const node = nodeOf(origin);
  const where = node === null ? undefined : nodes.get(node);
  return [{ facet: name, says: says(origin, where, from), ...sited(where) }];
}

/** The node a reader wants to be taken to: for a `$ref`, the definition. */
function nodeOf(origin: FacetOrigin): string | null {
  if (origin.kind === 'empty') return null;
  return origin.kind === 'defRef' ? origin.def : origin.node;
}

/** What one origin says about itself. */
function says(origin: FacetOrigin, where: Described | undefined, from: string): string {
  switch (origin.kind) {
    case 'literal':
      return `written at ${where?.what ?? 'the cell'}`;
    case 'inline':
      return `row ${origin.row + 1}, field ${origin.col + 1} of ${where?.what ?? 'a data block'}`;
    case 'external':
      return `row ${origin.row + 1}, field ${origin.col + 1} of \`${beside(from, origin.file)}\``;
    case 'formulaRange':
      return `filled from \`${origin.anchor}\` by ${where?.what ?? 'a formula range'}`;
    case 'defRef':
      return `the definition ${where?.what ?? ''}`.trim();
    case 'param':
      return `the parameter${origin.params.length === 1 ? '' : 's'} ${origin.params
        .map((one) => `\`${one}\``)
        .join(', ')}, in \`${origin.template}\``;
    case 'override':
      return 'an override';
    default:
      return 'nothing — this cell holds no value';
  }
}

function through(from: string, where: Described | undefined): string {
  if (from === 'override') return 'an override';
  return from === 'cell' ? 'the cell itself' : (where?.what ?? `a ${from} band`);
}

/** A file as the spec would name it, relative to the spec; the absolute path is this machine's. */
function beside(from: string, file: string): string {
  const near = relative(dirname(from), file);
  return near === '' || near.startsWith('..') ? file : near;
}

/** Where the node is, or nowhere to go. */
function sited(where: Described | undefined): { file: string; start: number; end: number } {
  return where === undefined
    ? { file: '', start: 0, end: 0 }
    : { file: where.file, start: where.span.start, end: where.span.end };
}

/** The innermost node whose span holds an offset: the cell, not the sheet it sits in. */
export function nodeUnder(nodes: Nodes, file: string, offset: number): NodeId | null {
  let found: NodeId | null = null;
  let narrowest = Number.POSITIVE_INFINITY;

  for (const [id, node] of nodes) {
    if (node.file !== file) continue;
    if (offset < node.span.start || offset > node.span.end) continue;

    const width = node.span.end - node.span.start;
    if (width >= narrowest) continue;

    narrowest = width;
    found = id as NodeId;
  }

  return found;
}

interface Described {
  readonly file: string;
  readonly span: { readonly start: number; readonly end: number };
  readonly what: string;
}

/** Every node a provenance can name, by its id. */
export type Nodes = ReadonlyMap<string, Described>;

/** Every node a provenance can name, and what to call it (the core carries identity, not prose — ADR-004). */
export function nodesOf(doc: SpecDoc): Nodes {
  const nodes = new Map<string, Described>();
  const put = (node: SpecNode, what: string): void => {
    nodes.set(node.id, { file: node.file, span: node.span, what });
  };

  for (const param of doc.params) put(param, `the parameter \`${param.name}\``);
  for (const def of doc.defs.styles) put(def, `\`defs.styles.${def.name}\``);
  for (const def of doc.defs.values) put(def, `\`defs.values.${def.name}\``);
  for (const def of doc.defs.formulas) put(def, `\`defs.formulas.${def.name}\``);
  for (const [at, override] of doc.overrides.entries()) put(override, `override ${at + 1}`);

  for (const sheet of doc.sheets) inSheet(sheet, put);
  return nodes;
}

function inSheet(sheet: Sheet, put: (node: SpecNode, what: string) => void): void {
  for (const cell of sheet.cells) put(cell, `\`${spelled(cell.at)}\``);
  for (const range of sheet.formulas) put(range, `the range \`${spelled(range.at)}\``);
  for (const block of sheet.data) put(block, `the data block at \`${spelled(block.at)}\``);
  for (const band of sheet.columns) put(band, `column \`${spelled(band.at)}\``);
  for (const band of sheet.rows) put(band, `row \`${spelled(band.at)}\``);
  for (const merge of sheet.merges) put(merge, `the merge \`${spelled(merge.at)}\``);
}

/** A value the loader kept as a template reads back as the text the spec wrote. */
function spelled(value: string | { readonly text: string }): string {
  return typeof value === 'string' ? value : value.text;
}
