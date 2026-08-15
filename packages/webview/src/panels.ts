import { columnLabel } from '@yxl-vscode/units';
import type { Asks, Reached, Showing } from './draw';
import type { Drawing, Refused, Uncomputed } from './protocol';

/**
 * Everything the preview says around the grid: the parameters to turn, the tabs
 * to pick a sheet with, and the sentences under it.
 *
 * Apart from the grid because they change on different beats — the grid when
 * the spec does, these whenever the reader points at something — and because a
 * file that draws a spreadsheet and writes prose is two files.
 */

export /**
 * The parameters, as boxes to turn.
 *
 * One spec stands for several workbooks (`docs/spec.md` §7); this is how a
 * reader looks at the others without editing anything. Emptying a box gives the
 * parameter back to the spec's own default.
 */
function parameters(drawing: Drawing, asks: Asks): HTMLElement {
  const panel = document.createElement('details');
  panel.className = 'params';
  panel.open = drawing.params.some((param) => param.set);

  const heading = document.createElement('summary');
  const changed = drawing.params.filter((param) => param.set).length;
  heading.textContent = changed === 0 ? 'Parameters' : `Parameters (${changed} set)`;
  panel.append(heading);

  const form = document.createElement('div');
  form.className = 'boxes';

  for (const param of drawing.params) {
    const label = document.createElement('label');
    label.textContent = param.name;

    const box = document.createElement('input');
    box.type = 'text';
    box.value = param.value;
    box.size = 12;
    if (param.set) box.classList.add('set');
    box.addEventListener('change', () => asks.setParam(param.name, box.value));

    label.append(box);
    form.append(label);
  }

  panel.append(form);
  return panel;
}

export /**
 * Why some cells show a formula rather than what it comes to.
 *
 * Said once, under the grid, rather than on every cell: a reader who sees one
 * formula among numbers is owed the reason, and the reason is the same for all
 * of them.
 */
function uncomputed(said: Uncomputed): string {
  if (said.kind === 'tooMany') {
    return `Nothing is computed here: this workbook holds more than ${said.limit} formulas, and computing some of them would make every total over the rest wrong.`;
  }

  const shown = said.names.slice(0, 3).join(', ');
  const rest = said.names.length > 3 ? `, and ${said.names.length - 3} more` : '';

  return `Not computed here: ${shown}${rest} — this preview does not model tables or workbook-defined names, so formulas that use them show as formulas.`;
}

export /**
 * Why an edit did not happen, said where the edit was attempted — and, where
 * there is one, the way it could still be made.
 *
 * The way is `overrides:`, which is the exception said out loud
 * (`docs/spec.md` §23). It is offered rather than taken: an escape hatch that
 * opens on its own is not an escape hatch (ADR-007).
 */
function refusal(refused: Refused, asks: Asks): HTMLElement {
  const said = document.createElement('p');
  said.className = 'refused';
  said.append(refused.why);

  const typed = refused.override;
  if (typed !== null) {
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'go';
    go.textContent = 'Write it as an override…';
    go.addEventListener('click', () => asks.overrideWith(typed));

    said.append(' ', go);
  }

  return said;
}

export /** What the cursor is reaching, said above the grid so the highlight is explained. */
function reaching(reached: Reached): HTMLElement {
  const said = document.createElement('p');
  said.className = 'reaching';

  const count = reached.cells.size;
  said.textContent =
    count === 0
      ? `${reached.says} reaches no cell the grid holds`
      : `${reached.says} reaches ${count} cell${count === 1 ? '' : 's'}`;

  return said;
}

export /**
 * Where each facet of the selected cell came from.
 *
 * Every line is a place in a file, so every line can be gone to — which is half
 * of the bidirectional jump this release is for.
 */
function inspector(showing: Showing, asks: Asks): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'inspector';

  const at = showing.selected;
  const heading = document.createElement('h2');
  heading.textContent = at === null ? 'Nothing selected' : `${columnLabel(at.col)}${at.row}`;
  panel.append(heading);

  if (showing.sources?.length === 0) {
    panel.append(note('Nothing writes this cell.'));
    return panel;
  }

  const list = document.createElement('dl');
  for (const source of showing.sources ?? []) {
    const facet = document.createElement('dt');
    facet.textContent = source.facet;

    const says = document.createElement('dd');
    if (source.file === '') {
      says.textContent = source.says;
    } else {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'go';
      go.textContent = source.says;
      go.title = source.file;
      go.addEventListener('click', () => asks.reveal(source));
      says.append(go);
    }

    list.append(facet, says);
  }

  panel.append(list);
  return panel;
}

export function tabs(
  drawing: Drawing,
  showing: number,
  onShow: (index: number) => void,
): HTMLElement {
  const bar = document.createElement('nav');
  bar.className = 'tabs';

  for (const [index, sheet] of drawing.sheets.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = sheet.name;
    tab.className = index === showing ? 'tab showing' : 'tab';
    tab.addEventListener('click', () => onShow(index));
    bar.append(tab);
  }

  return bar;
}

export function note(text: string): HTMLElement {
  const said = document.createElement('p');
  said.className = 'note';
  said.textContent = text;
  return said;
}

export function problems(drawing: Drawing, asks: Asks): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'problems';

  for (const problem of drawing.diagnostics) {
    const item = document.createElement('li');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'go';
    go.textContent = problem.message;
    go.title = problem.file;
    go.addEventListener('click', () => asks.reveal({ facet: problem.code, says: '', ...problem }));

    item.append(go);
    list.append(item);
  }

  return list;
}
