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
  LexerTreeBuilder,
  sequenceNodeType,
  UniverFormulaEnginePlugin,
} from '@univerjs/engine-formula';
import type { ScalarValue } from '@yxl-vscode/spec';
import { cellOf, type SheetName, sheetName } from '@yxl-vscode/units';
import type { About, Asked, Computed, Engine, Held, HeldSheet } from './engine';

/**
 * The formula engine as this project uses it (ADR-013, ADR-025): the lex-parse-
 * interpret layer under Univer's own entry points, which answers in the same
 * tick over the values it is handed.
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
  const tokens = injector.get(LexerTreeBuilder);
  const functions = injector.get(IFunctionService);

  functions.registerExecutors(...ALL_IMPLEMENTED_FUNCTIONS.map(([Fn, name]) => new Fn(name)));

  let sheets: string[] = [];
  let loaded = 0;

  return {
    holds: (book) => {
      // Fresh ids each load: the engine caches ranges process-wide by unit,
      // sheet and position, with nothing in the key about the values (ADR-025).
      loaded += 1;
      sheets = book.map((sheet) => sheet.name);
      config.registerUnitData({ [BOOK]: sheetData(book, `${born}-${loaded}`) });
      config.registerSheetNameMap({ [BOOK]: named(sheets, `${born}-${loaded}`) });
    },

    about: (asked) => about(asked, tokens, functions),

    compute: (asked) => {
      const at = cellOf(asked.at);
      const sheet = idOf(sheets, asked.sheet, `${born}-${loaded}`);

      runtime.reset();
      runtime.setCurrent(at.row - 1, at.col - 1, ROWS, COLUMNS, sheet, BOOK);
      return computed(asked, lexer, parser, interpreter);
    },
  };
}

/**
 * What a formula names, off the lexer's tokens. The lexer calls any bare name a
 * function — `SUM`, `target_revenue`, `StoreMaster[store_name` alike — so a
 * name with no executor is exactly the set this cannot compute.
 */
function about(asked: Asked, tokens: LexerTreeBuilder, functions: IFunctionService): About {
  const said = tokens.sequenceNodesBuilder(asked.formula) ?? [];
  const unknown: string[] = [];
  const reads = new Set<SheetName>([asked.sheet]);

  for (const node of said) {
    if (typeof node === 'string') continue;

    if (node.nodeType === sequenceNodeType.FUNCTION) {
      if (!functions.hasExecutor(node.token.toUpperCase())) unknown.push(whole(node.token));
    } else if (
      node.nodeType === sequenceNodeType.DEFINED_NAME ||
      node.nodeType === sequenceNodeType.TABLE
    ) {
      unknown.push(whole(node.token));
    } else if (node.nodeType === sequenceNodeType.REFERENCE) {
      const elsewhere = sheetOf(node.token);
      if (elsewhere !== null) reads.add(elsewhere);
    }
  }

  return { unknown, reads: [...reads] };
}

/** A name as the spec wrote it: the lexer drops a table reference's closing bracket. */
function whole(token: string): string {
  return token.includes('[') && !token.endsWith(']') ? `${token}]` : token;
}

/** The sheet a reference names, or `null` where it names the one it sits in. */
function sheetOf(token: string): SheetName | null {
  const cut = token.lastIndexOf('!');
  if (cut < 0) return null;

  const spelled = token.slice(0, cut);
  const bare = spelled.startsWith("'") ? spelled.slice(1, -1).replaceAll("''", "'") : spelled;
  return sheetName(bare);
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

  // Waiting for one would make every projection asynchronous.
  if (interpreter.checkAsyncNode(node)) {
    return { kind: 'unsupported', why: 'this function answers asynchronously' };
  }

  const [across, down] = asked.offset;
  const done = interpreter.execute(generateExecuteAstNodeData(node, across, down));
  return read(done);
}

/** What the engine handed back; a range or array is read at its first cell, as Excel shows it. */
function read(done: ReturnType<Interpreter['execute']>): Computed {
  // `isReferenceObject` is the engine's test, not a type guard.
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
