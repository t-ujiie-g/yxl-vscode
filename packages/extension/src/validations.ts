import {
  type CompiledAsk,
  type CompiledGrid,
  type CompiledSheet,
  type CompiledValidation,
  cellAt,
  sheetOf,
} from '@yxl-vscode/compile';
import { reading, setValidation } from '@yxl-vscode/intent';
import type { Comparison, Saying } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, cellOf, rangeOf, type SheetName, within } from '@yxl-vscode/units';
import type { Validated } from '@yxl-vscode/webview/protocol';
import { applied, type Port, rectIn, type Spec, sheetNamed } from './write';

/**
 * A `list:` validation written over the selection, or the ones it touches taken
 * off (`docs/spec.md` §10). The list is the kind a reader makes by hand.
 */
export async function validate(spec: Spec, asked: Validated, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const rect = rectIn(asked);
  const where = { sheet, rect, choices: asked.choices };
  const intent = setValidation(spec, where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'validate', about: null });
  if (!done) return;

  const over = rangeOf(rect);
  const many = asked.choices?.length ?? 0;
  port.said(many === 0 ? `${over} takes any value now.` : `${over} takes one of ${many}.`);
}

/** The validation a cell is under: the last one written to cover it, since Excel keeps one per cell. */
export function validating(sheet: CompiledSheet, at: A1Addr): CompiledValidation | null {
  const cell = cellOf(at);
  return sheet.validations.findLast((one) => within(cell, one.rect)) ?? null;
}

/** The choices a list offers, read off the cells where it names them (`docs/spec.md` §10). */
export function choicesOf(grid: CompiledGrid, here: SheetName, asks: CompiledAsk): string[] | null {
  if (asks.kind === 'list') return asks.choices.map((one) => String(one ?? ''));
  if (asks.kind !== 'listFrom') return null;

  const sheet = sheetOf(grid, asks.sheet ?? here);
  if (sheet === null) return [];

  const choices: string[] = [];
  for (let row = asks.rect.top; row <= asks.rect.bottom; row += 1) {
    for (let col = asks.rect.left; col <= asks.rect.right; col += 1) {
      // The written value, never a computed one: a choice picked here is typed
      // into a cell, and nothing evaluated is ever written (ADR-014).
      const value = cellAt(sheet, addrAt({ col, row }))?.value ?? null;
      if (value !== null && String(value) !== '') choices.push(String(value));
    }
  }

  return choices;
}

/** What a validation asks, in a reader's words, with what the spec says about it first. */
export function validationSaid(one: CompiledValidation): string {
  const lines = [said(one.prompt), asking(one.asks), said(one.error)];
  if (!one.allowBlank) lines.push('A blank is refused.');

  return lines.filter((line) => line !== '').join('\n');
}

function said(one: Saying | null): string {
  if (one === null) return '';
  return [one.title, one.body].filter((part) => part !== null && part !== '').join(': ');
}

function asking(asks: CompiledAsk): string {
  switch (asks.kind) {
    case 'list':
      return 'One of the values in the list.';
    case 'listFrom':
      return 'One of the values in the cells it names.';
    case 'whole':
      return `A whole number ${compared(asks.compares)}.`;
    case 'decimal':
      return `A number ${compared(asks.compares)}.`;
    case 'text_length':
      return `Text whose length is ${compared(asks.compares)}.`;
    case 'date':
      return `A date ${compared(asks.compares)}.`;
  }
}

function compared(compares: Comparison): string {
  switch (compares.kind) {
    case 'between':
      return `between ${String(compares.low)} and ${String(compares.high)}`;
    case 'not_between':
      return `outside ${String(compares.low)} and ${String(compares.high)}`;
    default:
      return `${compares.kind.replace('_', ' ')} ${String(compares.bound)}`;
  }
}
