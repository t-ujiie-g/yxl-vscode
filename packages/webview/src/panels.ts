import { columnLabel, nextSheetName, painted, type SheetName } from '@yxl-vscode/units';
import { says } from './menus';
import type {
  Choice,
  Drawing,
  Editable,
  Refused,
  Source,
  Summed,
  Typed,
  Uncomputed,
} from './protocol';
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
 * it has (ADR-001), then `overrides:` (ADR-007) — all offered, none taken, and
 * the keyboard kept until one is.
 */
export function refusal(refused: Refused, asks: Asks): HTMLElement {
  const over = document.createElement('div');
  over.className = 'over';
  over.setAttribute('data-why', refused.why);

  const asking = document.createElement('div');
  asking.className = 'refused';
  asking.setAttribute('role', 'dialog');
  asking.setAttribute('aria-modal', 'true');

  const why = document.createElement('p');
  why.className = 'why';
  why.textContent = refused.why;
  asking.append(why);

  const about = refused.about;
  if (about !== null) {
    for (const choice of refused.choices) {
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'choice';
      const says = moved(choice);
      pick.textContent = says === '' ? choice.what : `${choice.what} — ${says}`;
      pick.addEventListener('click', () => asks.answer(about, choice.id));
      asking.append(pick);
    }

    if (about.kind === 'edit' && refused.canOverride) asking.append(overriding(about, asks));
  }

  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'cancel';
  leave.textContent = 'Leave it as it is';
  leave.addEventListener('click', () => asks.stopAsking());
  asking.append(leave);

  over.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') asks.stopAsking();
    if (event.key === 'Tab') stepping(event, asking);
  });
  over.addEventListener('mousedown', (event) => event.stopPropagation());

  over.append(asking);
  return over;
}

/** The exception a refused edit offers, and the reason that goes in the file beside it (ADR-007). */
function overriding(about: Typed, asks: Asks): HTMLElement {
  const row = document.createElement('p');
  row.className = 'anyway';

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

  row.append(why, go);
  return row;
}

/** `Tab` around the question rather than out of it, which is half of what makes it one. */
function stepping(event: KeyboardEvent, asking: HTMLElement): void {
  const inside = [...asking.querySelectorAll<HTMLElement>('button, input')];
  const first = inside[0];
  const last = inside.at(-1);
  if (first === undefined || last === undefined) return;

  const on = document.activeElement;
  if (event.shiftKey && (on === first || !asking.contains(on))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && on === last) {
    event.preventDefault();
    first.focus();
  }
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
export function locked(editable: Exclude<Editable, 'direct'>): HTMLElement {
  const said = document.createElement('p');
  said.className = 'locked';
  said.textContent = LOCKED[editable];

  return said;
}

const LOCKED: Record<Exclude<Editable, 'direct'>, string> = {
  external:
    'This cell cannot be typed into: its value comes from a file beside the spec. Type into it anyway to be offered an override.',
  mediated:
    'This cell cannot be typed into: more than one thing could change to make that edit. Type into it anyway to be offered an override.',
  rich: 'This cell holds rich text. Pick a run in the bar over the grid to retype it; a run keeps the font it wears.',
};

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

  if (showing.sources?.length === 0) panel.append(note('Nothing writes this cell.'));
  else if (showing.sources !== null) panel.append(sourceList(showing.sources, asks));

  const carried = showing.carried ?? [];
  if (carried.length > 0) {
    panel.append(note('This sheet also holds, undrawn:'), sourceList(carried, asks));
  }

  return panel;
}

/** A list of sources, each line a place in the spec to go to. */
function sourceList(sources: readonly Source[], asks: Asks): HTMLElement {
  const list = document.createElement('dl');

  for (const source of sources) {
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

  return list;
}

/** The sheets, as the tabs both spreadsheets keep by the grid, and the `+` that makes another. */
export function tabs(showing: Showing, asks: Asks): HTMLElement {
  const drawing = showing.drawing;
  const bar = document.createElement('nav');
  bar.className = 'tabs';

  const dragged = { name: '' };

  for (const [index, sheet] of drawing.sheets.entries()) {
    if (index === showing.naming) {
      bar.append(naming(sheet.name, asks));
      continue;
    }

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = sheet.name;
    tab.className = index === showing.sheet ? 'tab showing' : 'tab';
    if (sheet.visibility !== 'visible') tab.classList.add('away');
    if (sheet.tabColor !== null) {
      tab.classList.add('coloured');
      tab.style.borderBottomColor = painted(sheet.tabColor);
    }
    says(
      tab,
      sheet.visibility === 'visible'
        ? 'Double-click to rename, drag to reorder'
        : `Hidden in Excel — \`${sheet.visibility}\``,
    );

    tab.addEventListener('click', () => asks.showSheet(index));

    tab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      asks.pointAt({ kind: 'tab', sheet: index, x: event.clientX, y: event.clientY });
    });

    dragging(tab, sheet.name, index, dragged, asks);
    bar.append(tab);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tab add';
  add.textContent = '+';
  says(add, 'Add a sheet');
  // Added under the next free name at once, as both spreadsheets do — a webview
  // has no `prompt`, and renaming is the tab's own gesture.
  add.addEventListener('click', () =>
    asks.addSheet(nextSheetName(drawing.sheets.map((one) => one.name as SheetName))),
  );
  bar.append(add);

  return bar;
}

/** A tab dragged along the bar, which is the order of `sheets:` (`docs/spec.md` §2). */
function dragging(
  tab: HTMLElement,
  name: string,
  index: number,
  dragged: { name: string },
  asks: Asks,
): void {
  tab.draggable = true;

  tab.addEventListener('dragstart', () => {
    dragged.name = name;
  });

  tab.addEventListener('dragover', (event) => {
    if (dragged.name === '' || dragged.name === name) return;

    event.preventDefault();
    tab.classList.add('under');
  });

  tab.addEventListener('dragleave', () => tab.classList.remove('under'));

  tab.addEventListener('drop', (event) => {
    event.preventDefault();
    tab.classList.remove('under');
    if (dragged.name === '' || dragged.name === name) return;

    asks.moveSheet(dragged.name, index);
    dragged.name = '';
  });

  tab.addEventListener('dragend', () => {
    dragged.name = '';
  });
}

/** The tab, made the box the new name is typed in — a webview has no dialog to ask in. */
function naming(was: string, asks: Asks): HTMLElement {
  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'tab naming';
  box.value = was;

  let over = false;
  const done = (take: boolean) => {
    if (over) return;
    over = true;

    const name = box.value.trim();
    if (take && name !== '' && name !== was) asks.renameSheet(was, name);
    else asks.nameSheet(null);
  };

  box.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') done(true);
    if (event.key === 'Escape') done(false);
  });
  box.addEventListener('blur', () => done(true));

  return box;
}

/** A line of prose under the grid — what the host said, or why something is not drawn. */
export function note(text: string): HTMLElement {
  const said = document.createElement('p');
  said.className = 'note';
  said.textContent = text;
  return said;
}

/** Every diagnostic the projection reported, each a button that goes to where it is written. */
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
