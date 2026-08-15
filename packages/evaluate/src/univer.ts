import { type ICellData, ObjectMatrix, Univer } from '@univerjs/core';
import type {
  ArrayValueObject,
  BaseReferenceObject,
  BaseValueObject,
} from '@univerjs/engine-formula';
import {
  ALL_IMPLEMENTED_FUNCTIONS,
  AstTreeBuilder,
  generateExecuteAstNodeData,
  IFormulaCurrentConfigService,
  IFormulaRuntimeService,
  IFunctionService,
  Interpreter,
  Lexer,
  UniverFormulaEnginePlugin,
} from '@univerjs/engine-formula';
import type { ScalarValue } from '@yxl-vscode/spec';
import { cellOf } from '@yxl-vscode/units';
import type { Asked, Computed, Engine, Held, HeldSheet } from './engine';

/**
 * The formula engine, as this project uses it (ADR-013, ADR-025).
 *
 * Univer's own entry points expect a live workbook and answer asynchronously.
 * This uses the layer under them — lex, parse, interpret — which needs only the
 * cell values it is handed and answers in the same tick, so the projection
 * stays the synchronous function over text that everything else here is.
 */
export function univerEngine(): Engine {
  engines += 1;
  const born = engines;
  const univer = new Univer();
  univer.registerPlugin(UniverFormulaEnginePlugin);

  const injector = univer.__getInjector();
  const config = injector.get(IFormulaCurrentConfigService);
  const runtime = injector.get(IFormulaRuntimeService);
  const lexer = injector.get(Lexer);
  const parser = injector.get(AstTreeBuilder);
  const interpreter = injector.get(Interpreter);

  injector
    .get(IFunctionService)
    .registerExecutors(...ALL_IMPLEMENTED_FUNCTIONS.map(([Fn, name]) => new Fn(name)));

  let sheets: string[] = [];
  let loaded = 0;

  return {
    holds: (book) => {
      // A new set of ids per load, because the engine caches a materialised
      // range in a process-wide table keyed by unit, sheet, and position — with
      // nothing in the key to say which *values* it holds. Reading `A1:A2`
      // once would otherwise freeze it for every later pass and every later
      // preview in this process. Fresh ids are fresh keys.
      loaded += 1;
      sheets = book.map((sheet) => sheet.name);
      config.registerUnitData({ [BOOK]: sheetData(book, `${born}-${loaded}`) });
      config.registerSheetNameMap({ [BOOK]: named(sheets, `${born}-${loaded}`) });
    },

    compute: (asked) => {
      const at = cellOf(asked.at);
      const sheet = idOf(sheets, asked.sheet, `${born}-${loaded}`);

      runtime.reset();
      runtime.setCurrent(at.row - 1, at.col - 1, ROWS, COLUMNS, sheet, BOOK);
      return computed(asked, lexer, parser, interpreter);
    },
  };
}

function computed(
  asked: Asked,
  lexer: Lexer,
  parser: AstTreeBuilder,
  interpreter: Interpreter,
): Computed {
  const lexed = lexer.treeBuilder(asked.formula);
  if (typeof lexed === 'string') return { kind: 'error', error: lexed };
  if (lexed === undefined || Array.isArray(lexed)) {
    return { kind: 'unsupported', why: 'this formula could not be read' };
  }

  const node = parser.parse(lexed);
  if (node === null || node === undefined) {
    return { kind: 'unsupported', why: 'this formula could not be read' };
  }

  // An async node is a function that would answer later — a web request, a
  // custom function. Waiting for one would make every projection asynchronous
  // for the sake of a function no spec here uses yet.
  if (interpreter.checkAsyncNode(node)) {
    return { kind: 'unsupported', why: 'this function answers asynchronously' };
  }

  const [across, down] = asked.offset;
  const done = interpreter.execute(generateExecuteAstNodeData(node, across, down));
  return read(done);
}

/**
 * What the engine handed back, as a value or an error.
 *
 * A reference or an array is read at its first cell, which is what Excel shows
 * when a range lands in a cell that wants one value.
 */
function read(done: ReturnType<Interpreter['execute']>): Computed {
  // A reference is a range until it is asked for its values; `isReferenceObject`
  // is the engine's own test for that and not a type guard, so the narrowing is
  // ours to state.
  const single = done.isReferenceObject()
    ? (done as BaseReferenceObject).toArrayValueObject()
    : done;
  const one = (single.isArray() ? (single as ArrayValueObject).getFirstCell() : single) as
    | BaseValueObject
    | ArrayValueObject;

  if (one.isError()) return { kind: 'error', error: String(one.getValue()) };

  const value = one.getValue();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return { kind: 'value', value };
  }

  return { kind: 'value', value: null };
}

/** Engines made so far, so that two of them in one process never share a cache key. */
let engines = 0;

/** One workbook, big enough that a reference never falls off the edge of it. */
const BOOK = 'yxl';
const ROWS = 1_048_576;
const COLUMNS = 16_384;

function sheetData(book: readonly HeldSheet[], loaded: string) {
  const data: Record<string, ReturnType<typeof sheetItem>> = {};
  for (const [index, sheet] of book.entries()) data[id(index, loaded)] = sheetItem(sheet.cells);
  return data;
}

function sheetItem(cells: readonly Held[]) {
  const rows: Record<number, Record<number, ICellData>> = {};
  for (const cell of cells) {
    const at = cellOf(cell.at);
    const row = rows[at.row - 1] ?? {};
    row[at.col - 1] = { v: held(cell.value) };
    rows[at.row - 1] = row;
  }

  return {
    cellData: new ObjectMatrix<ICellData>(rows),
    rowCount: ROWS,
    columnCount: COLUMNS,
    rowData: {},
    columnData: {},
  };
}

function held(value: ScalarValue): string | number | boolean {
  return value === null ? '' : value;
}

/** Univer addresses a sheet by id and resolves a name to one, so this owns both. */
function named(sheets: readonly string[], loaded: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [index, name] of sheets.entries()) map[name] = id(index, loaded);
  return map;
}

function idOf(sheets: readonly string[], name: string, loaded: string): string {
  const index = sheets.indexOf(name);
  return id(index === -1 ? 0 : index, loaded);
}

function id(index: number, loaded: string): string {
  return `s${index}-${loaded}`;
}
