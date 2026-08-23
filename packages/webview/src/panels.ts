import { columnLabel, nextSheetName, type SheetName } from '@yxl-vscode/units';
import { says } from './menus';
import type { Choice, Drawing, Refused, Summed, Uncomputed } from './protocol';
import type { Asks, Reached, Showing } from './showing';

/** The parameters as boxes to turn (`docs/spec.md` §7); emptying one gives the default back. */
export function parameters(drawing: Drawing, asks: Asks): HTMLElement {
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

/**
 * What the rectangle selected comes to, said where every spreadsheet says it:
 * how many cells hold anything, and what the numbers among them add up to.
 */
export function comesTo(summed: Summed): HTMLElement | null {
  const said = document.createElement('p');
  said.className = 'comes';
  if (summed.held === 0) return null;

  const parts = [`Count ${summed.held}`];
  if (summed.numbers > 0) {
    parts.unshift(`Sum ${round(summed.sum)}`, `Average ${round(summed.sum / summed.numbers)}`);
  }

  said.textContent = parts.join('   ');
  return said;
}

/** A number as a status bar shows one: what it is, without a tail of floating point. */
function round(value: number): string {
  const said = Math.round(value * 1e9) / 1e9;
  return said.toLocaleString('en-US', { maximumFractionDigits: 9 });
}

/** Why some cells show a formula rather than what it comes to, said once under the grid. */
export function uncomputed(said: Uncomputed): string {
  if (said.kind === 'tooMany') {
    return `Nothing is computed here: this workbook holds more than ${said.limit} formulas, and computing some of them would make every total over the rest wrong.`;
  }

  const shown = said.names.slice(0, 3).join(', ');
  const rest = said.names.length > 3 ? `, and ${said.names.length - 3} more` : '';

  return `Not computed here: ${shown}${rest} — this preview does not model tables or workbook-defined names, so formulas that use them show as formulas.`;
}

/**
 * Why an edit did not happen, and the ways it could still be made: the answers
 * it has (ADR-001), then `overrides:` (ADR-007) — all offered, none taken.
 */
export function refusal(refused: Refused, asks: Asks): HTMLElement {
  const said = document.createElement('p');
  said.className = 'refused';
  said.append(refused.why);

  const about = refused.about;
  if (about === null) return said;

  for (const choice of refused.choices) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'choice';
    const says = moved(choice);
    pick.textContent = says === '' ? choice.what : `${choice.what} — ${says}`;
    pick.addEventListener('click', () => asks.answer(about, choice.id));
    said.append(' ', pick);
  }

  if (about.kind !== 'edit' || !refused.canOverride) return said;

  const why = document.createElement('input');
  why.type = 'text';
  why.className = 'reason';
  why.placeholder = 'why this cell differs (optional)';

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'go';
  go.textContent = 'Write it as an override';
  go.addEventListener('click', () => asks.overrideWith(about, why.value));
  why.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') asks.overrideWith(about, why.value);
  });

  said.append(' ', why, ' ', go);
  return said;
}

/** What a choice would move, as a count a reader can act on and a few names; nothing where it moves no cell. */
function moved(choice: Choice): string {
  if (choice.moves === 0) return '';

  const cells = `${choice.moves} cell${choice.moves === 1 ? '' : 's'}`;
  if (choice.sample.length === 0) return cells;

  const rest = choice.moves > choice.sample.length ? ', …' : '';
  return `${cells} (${choice.sample.join(', ')}${rest})`;
}

/** That this cell cannot be typed into, in the terms of what stands in the way. */
export function locked(editable: 'mediated' | 'external'): HTMLElement {
  const said = document.createElement('p');
  said.className = 'locked';
  said.textContent =
    editable === 'external'
      ? 'This cell cannot be typed into: its value comes from a file beside the spec. Type into it anyway to be offered an override.'
      : 'This cell cannot be typed into: more than one thing could change to make that edit. Type into it anyway to be offered an override.';

  return said;
}

/** What the cursor is reaching, said above the grid so the highlight is explained. */
export function reaching(reached: Reached): HTMLElement {
  const said = document.createElement('p');
  said.className = 'reaching';

  const count = reached.cells.size;
  said.textContent =
    count === 0
      ? `${reached.says} reaches no cell the grid holds`
      : `${reached.says} reaches ${count} cell${count === 1 ? '' : 's'}`;

  return said;
}

/** Where each facet of the selected cell came from; every line is a place to go to. */
export function inspector(showing: Showing, asks: Asks): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'inspector';

  const at = showing.selected;
  const heading = document.createElement('h2');
  heading.textContent = at === null ? 'Nothing selected' : `${columnLabel(at.col)}${at.row}`;
  panel.append(heading);

  const editable = showing.editable;
  if (editable !== null && editable !== 'direct') panel.append(locked(editable));

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

/** The sheets, as the tabs both spreadsheets keep under the grid, and the `+` that makes another. */
export function tabs(drawing: Drawing, showing: number, asks: Asks): HTMLElement {
  const bar = document.createElement('nav');
  bar.className = 'tabs';

  for (const [index, sheet] of drawing.sheets.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = sheet.name;
    tab.className = index === showing ? 'tab showing' : 'tab';
    tab.addEventListener('click', () => asks.showSheet(index));
    bar.append(tab);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tab add';
  add.textContent = '+';
  says(add, 'Add a sheet');
  add.addEventListener('click', () => {
    const taken = drawing.sheets.map((one) => one.name as SheetName);
    const name = window.prompt('Name for the new sheet', nextSheetName(taken));
    if (name !== null && name.trim() !== '') asks.addSheet(name.trim());
  });
  bar.append(add);

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
