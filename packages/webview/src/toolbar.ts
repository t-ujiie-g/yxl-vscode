import type { StyleProperty, StyleValues } from '@yxl-vscode/spec';
import type { DrawnCell } from './protocol';
import type { Asks, Showing } from './showing';

/** The looks a reader reaches for first, over the cells they have selected. */
export function toolbar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  for (const one of TOGGLES) bar.append(toggle(one, showing, asks));

  return bar;
}

interface Toggle {
  readonly key: StyleProperty;
  readonly mark: string;
  readonly says: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: 'font.bold', mark: 'B', says: 'Bold' },
  { key: 'font.italic', mark: 'I', says: 'Italic' },
  { key: 'font.underline', mark: 'U', says: 'Underline' },
  { key: 'font.strike', mark: 'S', says: 'Strikethrough' },
];

/** One switch, showing what the selected cell wears and asking for the other of it. */
function toggle(of: Toggle, showing: Showing, asks: Asks): HTMLElement {
  const on = wearing(showing, of.key);
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look${on ? ' on' : ''}`;
  button.textContent = of.mark;
  button.title = of.says;
  button.disabled = showing.selected === null;
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.addEventListener('click', () => asks.wear({ [of.key]: !on } as StyleValues));

  return button;
}

/** Whether the cell the reader has selected already wears it, which is what a switch switches. */
function wearing(showing: Showing, key: StyleProperty): boolean {
  const at = showing.selected;
  if (at === null) return false;

  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  const cell = cells.find((one: DrawnCell) => one.row === at.row && one.col === at.col);
  return cell?.style[key] === true;
}
