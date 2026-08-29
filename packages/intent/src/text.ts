import {
  type Book,
  type Language,
  type Nothing,
  type Saying,
  speaking,
  type Words,
} from '@yxl-vscode/diag';
import { columnLabel } from '@yxl-vscode/units';
import type { Stood } from './direct';

/** Every sentence this package says, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'intent.no-such-sheet': { sheet: string };
  'intent.nothing-writes-yet': { at: string };
  'intent.no-formula-to-change': { at: string };
  'intent.written-as-a-value': { at: string };
  'intent.holds-a-formula': { at: string };
  'intent.holds-rich-text': { at: string };
  'intent.reads-a-definition': { at: string };
  'intent.reads-a-parameter': { at: string; name: string };
  'intent.reads-a-row': { at: string; row: number; file: string };
  'intent.is-the-anchor': { at: string };
  'intent.is-filled-by': { at: string; anchor: string };
  'intent.nothing-to-change-yet': { at: string; sheet: string };
  'intent.no-place-in-the-file': Nothing;
  'intent.file-unreadable': { file: string };
  'intent.nothing-at-path': { path: string; file: string };
  'intent.not-written-as-a-sheet': { sheet: string };
  'intent.kept-in-another-file': { sheet: string; what: string };
  'intent.some-cannot': { done: number; held: readonly { at: string; by: Stood }[]; doing: string };
  'intent.one-cannot': { total: number; why: Saying; doing: string };
  'intent.write-as-override': { by: Stood; many: number };
  'intent.cannot-be-written': { at: string; why: Saying };
  'intent.data-field-no-formula': { at: string };
  'intent.not-as-overrides': Nothing;
  'intent.no-longer-a-definition': { at: string };
  'intent.definition-takes-a-value': { at: string };
  'intent.no-reference-to-write-over': { at: string };
  'intent.across-two-files': { one: string; other: string };
  'intent.nothing-to-detach': Nothing;
  'intent.these-cannot-be-written': { why: Saying };
  'intent.sheet-not-a-mapping': Nothing;
  'intent.rich-not-pasted': { at: string };
  'intent.formula-cannot-move': { at: string; why: Saying };
  'intent.nothing-on-that-line': Nothing;
  'intent.not-a-cell-of-its-own': { at: string };
  'intent.more-than-a-value': { at: string };
  'intent.gather-across-files': Nothing;
  'intent.nothing-to-empty': Nothing;
  'intent.range-across-files': { files: string };
  'intent.no-filter-to-take-off': { sheet: string };
  'intent.one-column-chart': { at: string };
  'intent.floats-from-a-parameter': Nothing;
  'intent.not-a-float': Nothing;
  'intent.a1-freezes-nothing': Nothing;
  'intent.split-and-freeze': { sheet: string };
  'intent.nothing-frozen': { sheet: string };
  'intent.no-such-band': { axis: string; at: number };
  'intent.nothing-moves': { axis: string; at: number; last: number };
  'intent.band-across-files': { axis: string; at: number; last: number };
  'intent.formula-would-break': { at: string; formula: string; why: Saying };
  'intent.rows-from-file': { file: string };
  'intent.merge-needs-more': Nothing;
  'intent.already-merged': { range: string };
  'intent.nothing-merged': Nothing;
  'intent.nothing-to-except': Nothing;
  'intent.no-document-for-override': Nothing;
  'intent.range-keeps-its-formula': { at: string };
  'intent.nothing-writes-it': { at: string };
  'intent.cells-already-here': Nothing;
  'intent.cut-overlaps': Nothing;
  'intent.rect-across-files': { files: string };
  'intent.cut-not-in-a-spec': Nothing;
  'intent.cut-across-files': { from: string; to: string };
  'intent.nothing-on-clipboard': Nothing;
  'intent.data-needs-empty-cells': Nothing;
  'intent.not-a-mapping': Nothing;
  'intent.already-called-that': { name: string };
  'intent.already-a-sheet-named': { name: string };
  'intent.no-place-to-rename': Nothing;
  'intent.named-formula-breaks': { what: string; why: Saying };
  'intent.named-across-files': { sheet: string };
  'intent.nothing-to-look-for': Nothing;
  'intent.nothing-holds-that': { sheet: string };
  'intent.found-across-files': { files: string };
  'intent.no-rich-text': { at: string };
  'intent.run-needs-something': Nothing;
  'intent.not-written-as-rich': { at: string };
  'intent.no-such-run': { at: string; runs: number; index: number };
  'intent.run-not-text': { at: string; index: number };
  'intent.run-reads-a-parameter': { at: string; index: number };
  'intent.no-sheets-key': Nothing;
  'intent.workbook-needs-a-sheet': Nothing;
  'intent.workbook-needs-a-shown-sheet': Nothing;
  'intent.named-by-cells': { sheet: string; shown: string; rest: number };
  'intent.no-place-to-take-out': Nothing;
  'intent.override-no-place': Nothing;
  'intent.take-out-across-files': { sheet: string };
  'intent.sheet-cannot-go-there': Nothing;
  'intent.already-there': { sheet: string };
  'intent.no-place-to-move': Nothing;
  'intent.not-a-list-to-reorder': Nothing;
  'intent.very-hidden': { sheet: string };
  'intent.very-hidden-not-written': Nothing;
  'intent.nothing-would-change': Nothing;
  'intent.sort-needs-more-rows': Nothing;
  'intent.not-a-table-here': Nothing;
  'intent.row-not-in-table': { row: number };
  'intent.rows-a-line-at-a-time': Nothing;
  'intent.already-in-that-order': Nothing;
  'intent.table-needs-more-rows': Nothing;
  'intent.list-needs-a-choice': Nothing;
  'intent.already-validated': { range: string };
  'intent.no-note-to-take-off': { at: string };
  'intent.note-needs-something': Nothing;
  'intent.note-not-text': { at: string };
  'intent.change-the-parameter': { name: string };
  'intent.change-the-definition': { name: string };
  'intent.write-as-its-own-value': { at: string };
  'intent.add-a-table-row': { anchor: string };
  'intent.write-as-a-new-cell': { at: string };
  'intent.write-into-the-file': { file: string };
  'intent.change-the-range-formula': { anchor: string; formula: string };
  'intent.split-the-range': { anchor: string; at: string };
  'intent.write-cells-of-their-own': { many: number };
  'intent.write-as-ranges': { many: number; axis: string };
  'intent.a-chart': { type: string };
  'intent.take-out-of-outline': { span: string };
  'intent.group-at-level': { span: string; level: number };
  'intent.which-is-many': { said: Saying; many: number; axis: string };
  'intent.split-so-out': { span: string };
  'intent.split-so-shown': { span: string };
  'intent.split-so-alone': { span: string };
  'intent.hide-span': { span: string };
  'intent.show-span': { span: string };
  'intent.hide-the-band': { span: string };
  'intent.show-the-band': { span: string };
  'intent.band-of-its-own': { axis: string };
  'intent.one-band-over': { span: string; axis: string };
  'intent.change-the-band': { span: string };
  'intent.put-lines-in': {
    axis: string;
    many: number;
    at: number;
    last: number;
    things: number;
    keys: number;
  };
  'intent.take-lines-away': {
    axis: string;
    many: number;
    at: number;
    last: number;
    things: number;
    keys: number;
  };
};

export const say = speaking<Says>();

/** What a sheet keeps under each key, as the sentence naming it needs the reader's word. */
export type HeldKey =
  | 'cells'
  | 'comments'
  | 'links'
  | 'validations'
  | 'tables'
  | 'charts'
  | 'images'
  | 'data'
  | 'formulas'
  | 'merges'
  | 'columns'
  | 'rows';

const en: Words<Says> = {
  'intent.no-such-sheet': ({ sheet }) => `there is no sheet named \`${sheet}\``,
  'intent.nothing-writes-yet': ({ at }) => `nothing writes \`${at}\` yet`,
  'intent.no-formula-to-change': ({ at }) => `\`${at}\` holds no formula to change`,
  'intent.written-as-a-value': ({ at }) => `\`${at}\` is written as a value, not as a formula`,
  'intent.holds-a-formula': ({ at }) =>
    `\`${at}\` holds a formula — type a formula to change it, starting with \`=\``,
  'intent.holds-rich-text': ({ at }) =>
    `\`${at}\` holds rich text — edit it a run at a time in the bar over the grid`,
  'intent.reads-a-definition': ({ at }) =>
    `\`${at}\` reads a definition, which other cells read too — changing it here would change them as well`,
  'intent.reads-a-parameter': ({ at, name }) => `\`${at}\` reads the parameter \`${name}\``,
  'intent.reads-a-row': ({ at, row, file }) => `\`${at}\` reads row ${row} of \`${file}\``,
  'intent.is-the-anchor': ({ at }) =>
    `\`${at}\` is where this range's one formula is written, and changing it changes every cell the range fills`,
  'intent.is-filled-by': ({ at, anchor }) =>
    `\`${at}\` is filled by the range anchored at \`${anchor}\`, which writes one formula for every cell it covers`,
  'intent.nothing-to-change-yet': ({ at, sheet }) =>
    `\`${at}\` on \`${sheet}\` holds nothing to change yet`,
  'intent.no-place-in-the-file': () => 'this cell has no place in the file to edit',
  'intent.file-unreadable': ({ file }) => `\`${file}\` could not be read`,
  'intent.nothing-at-path': ({ path, file }) => `nothing is at \`${path}\` in \`${file}\``,
  'intent.not-written-as-a-sheet': ({ sheet }) => `\`${sheet}\` is not written as a sheet`,
  'intent.kept-in-another-file': ({ sheet, what }) =>
    `\`${sheet}\` keeps its ${HELD.en[what as HeldKey] ?? `\`${what}\``} in another file`,
  'intent.some-cannot': ({ done, held, doing }) =>
    `${held.length} of the ${done + held.length} cells here cannot be ${DOING.en[doing] ?? doing}, so none were: ${grouped(held, 'en')}`,
  'intent.one-cannot': ({ total, why, doing }, worded) =>
    `1 of the ${total} cells here cannot be ${DOING.en[doing] ?? doing}, so none were: ${worded(why)}`,
  'intent.write-as-override': ({ by, many }) =>
    `Write ${many === 1 ? `the one that ${THE.en[by]}` : `the ${many} that ${THEY.en[by]}`} as ${
      by === 'definition'
        ? many === 1
          ? 'a value of its own'
          : 'values of their own'
        : many === 1
          ? 'an override'
          : 'overrides'
    }`,
  'intent.cannot-be-written': ({ at, why }, worded) =>
    `\`${at}\` cannot be written: ${worded(why)}`,
  'intent.data-field-no-formula': ({ at }) =>
    `\`${at}\` is a field of a \`data:\` block, which holds no formula`,
  'intent.not-as-overrides': () => 'these cells cannot be written as overrides',
  'intent.no-longer-a-definition': ({ at }) => `\`${at}\` no longer reads a definition`,
  'intent.definition-takes-a-value': ({ at }) =>
    `\`${at}\` would take a formula, and a cell that reads a definition takes a value in its place`,
  'intent.no-reference-to-write-over': ({ at }) => `\`${at}\` has no reference to write over`,
  'intent.across-two-files': ({ one, other }) =>
    `these cells are written across ${one} and ${other}, and this editor writes one file at a time`,
  'intent.nothing-to-detach': () => 'there is nothing here to detach',
  'intent.these-cannot-be-written': ({ why }, worded) =>
    `these cells cannot be written: ${worded(why)}`,
  'intent.sheet-not-a-mapping': () => 'these cells cannot be written: the sheet is not a mapping',
  'intent.rich-not-pasted': ({ at }) =>
    `\`${at}\` holds rich text, which this editor does not paste`,
  'intent.formula-cannot-move': ({ at, why }, worded) =>
    `\`${at}\` holds a formula that ${worded(why)}`,
  'intent.nothing-on-that-line': () =>
    'nothing on that line is written, so there is nothing to fill',
  'intent.not-a-cell-of-its-own': ({ at }) =>
    `\`${at}\` is not written as a cell of its own, so a table cannot take it over`,
  'intent.more-than-a-value': ({ at }) =>
    `\`${at}\` says more than a value, which a table has nowhere to keep`,
  'intent.gather-across-files': () =>
    'these cells are written in more than one file, which this cannot gather at once',
  'intent.nothing-to-empty': () => 'nothing in this range holds anything to empty',
  'intent.range-across-files': ({ files }) =>
    `this range is written across ${files}, and this editor empties one file at a time`,
  'intent.no-filter-to-take-off': ({ sheet }) => `\`${sheet}\` has no filter to take off`,
  'intent.one-column-chart': ({ at }) =>
    `\`${at}\` is one column, and a chart plots a column against the labels beside it`,
  'intent.floats-from-a-parameter': () =>
    'this floats where a parameter says, and moving it would write over the parameter',
  'intent.not-a-float': () => 'this is not written as something that floats',
  'intent.a1-freezes-nothing': () =>
    '`A1` freezes nothing — freeze at the first cell that is to scroll',
  'intent.split-and-freeze': ({ sheet }) =>
    `\`${sheet}\` is split, and a sheet cannot have both a \`split\` and a \`freeze\``,
  'intent.nothing-frozen': ({ sheet }) => `\`${sheet}\` freezes nothing to take off`,
  'intent.no-such-band': ({ axis, at }) => `there is no ${axis} ${at}`,
  'intent.nothing-moves': (one) => `nothing here moves when ${spanned(one, 'en')} is drawn`,
  'intent.band-across-files': (one) =>
    `${spanned(one, 'en')} reaches more than one file, which this cannot write at once`,
  'intent.formula-would-break': ({ at, formula, why }, worded) =>
    `\`${at}\` holds \`=${formula}\`, and ${worded(why)}`,
  'intent.rows-from-file': ({ file }) =>
    `the rows here come from \`${file}\`, which this cannot open a gap in`,
  'intent.merge-needs-more': () =>
    'a merge is more than one cell, so there is nothing here to draw as one',
  'intent.already-merged': ({ range }) =>
    `\`${range}\` is already merged, and a merge may not cross another`,
  'intent.nothing-merged': () => 'nothing here is merged',
  'intent.nothing-to-except': () => 'there is nothing here to except',
  'intent.no-document-for-override': () => 'this spec has no document to write an override into',
  'intent.range-keeps-its-formula': ({ at }) =>
    `\`${at}\` is where a range keeps its one formula, and an override here would take it from every cell the range fills — split the range instead`,
  'intent.nothing-writes-it': ({ at }) =>
    `\`${at}\` is not written by anything, so there is nothing here to make an exception to`,
  'intent.cells-already-here': () => 'these cells are already here',
  'intent.cut-overlaps': () => 'a cut cannot land on the cells it is taking, and these overlap',
  'intent.rect-across-files': ({ files }) =>
    `this rectangle would be written across ${files}, and this editor writes one file at a time`,
  'intent.cut-not-in-a-spec': () => 'the cells this cut takes are not in a spec file',
  'intent.cut-across-files': ({ from, to }) =>
    `this cut would take from ${from} and write to ${to}, and this editor writes one file at a time`,
  'intent.nothing-on-clipboard': () => 'there is nothing on the clipboard to put down',
  'intent.data-needs-empty-cells': () =>
    'a `data:` block can only go where nothing writes those cells yet',
  'intent.not-a-mapping': () => 'this sheet is not a mapping',
  'intent.already-called-that': ({ name }) => `this sheet is called \`${name}\` already`,
  'intent.already-a-sheet-named': ({ name }) => `there is already a sheet named \`${name}\``,
  'intent.no-place-to-rename': () => 'this sheet has no place in the file to rename',
  'intent.named-formula-breaks': ({ what, why }, worded) =>
    `${what} holds a formula that ${worded(why)}`,
  'intent.named-across-files': ({ sheet }) =>
    `\`${sheet}\` is named in more than one file, which this cannot rewrite at once`,
  'intent.nothing-to-look-for': () => 'there is nothing to look for',
  'intent.nothing-holds-that': ({ sheet }) => `nothing on \`${sheet}\` holds that any more`,
  'intent.found-across-files': ({ files }) =>
    `what was found is written across ${files}, and this editor writes one file at a time`,
  'intent.no-rich-text': ({ at }) => `\`${at}\` holds no rich text`,
  'intent.run-needs-something': () => 'a run needs something to say',
  'intent.not-written-as-rich': ({ at }) => `\`${at}\` is not written as rich text here`,
  'intent.no-such-run': ({ at, runs, index }) => `\`${at}\` has ${runs} runs, and no run ${index}`,
  'intent.run-not-text': ({ at, index }) => `run ${index} of \`${at}\` is not written as text`,
  'intent.run-reads-a-parameter': ({ at, index }) => `run ${index} of \`${at}\` reads a parameter`,
  'intent.no-sheets-key': () => 'this spec has no `sheets:` to put one in',
  'intent.workbook-needs-a-sheet': () => 'a workbook needs a sheet, and this is the only one',
  'intent.workbook-needs-a-shown-sheet': () =>
    'a workbook needs a sheet that shows, and this is the only one',
  'intent.named-by-cells': ({ sheet, shown, rest }) =>
    `\`${sheet}\` is named by ${shown}${rest === 0 ? '' : `, and ${rest} more`}, which would be left with \`#REF!\``,
  'intent.no-place-to-take-out': () => 'this sheet has no place in the file to take out',
  'intent.override-no-place': () => 'an override on this sheet has no place in the file',
  'intent.take-out-across-files': ({ sheet }) =>
    `\`${sheet}\` is written across more than one file, which this cannot take out at once`,
  'intent.sheet-cannot-go-there': () => 'a sheet cannot go there',
  'intent.already-there': ({ sheet }) => `\`${sheet}\` is already there`,
  'intent.no-place-to-move': () => 'this sheet has no place in the file to move',
  'intent.not-a-list-to-reorder': () => 'the sheets are not written as a list this can reorder',
  'intent.very-hidden': ({ sheet }) =>
    `\`${sheet}\` is \`very_hidden\`, which only Excel's VBA undoes`,
  'intent.very-hidden-not-written': () => '`very_hidden` is not written by this editor',
  'intent.nothing-would-change': () => 'nothing about this sheet would change',
  'intent.sort-needs-more-rows': () =>
    'a sort is more than one row, so there is nothing here to put in order',
  'intent.not-a-table-here': () =>
    'these rows are not a table written here, so there is no order to put them in',
  'intent.row-not-in-table': ({ row }) =>
    `row ${row} is not written in this table, so it has nothing to move`,
  'intent.rows-a-line-at-a-time': () => 'rows written a line at a time are not put in order yet',
  'intent.already-in-that-order': () => 'these rows are in that order already',
  'intent.table-needs-more-rows': () =>
    'a table is more than one row, so there is nothing here to anchor',
  'intent.list-needs-a-choice': () => 'a list needs a choice to offer',
  'intent.already-validated': ({ range }) =>
    `\`${range}\` already has a validation, and a cell takes one at a time`,
  'intent.no-note-to-take-off': ({ at }) => `\`${at}\` has no note to take off`,
  'intent.note-needs-something': () => 'a note needs something to say',
  'intent.note-not-text': ({ at }) => `the note on \`${at}\` is not written as text`,
  'intent.change-the-parameter': ({ name }) =>
    `Change the parameter \`${name}\`, which every cell reading it follows`,
  'intent.change-the-definition': ({ name }) =>
    `Change \`${name}\`, which every cell reading it follows`,
  'intent.write-as-its-own-value': ({ at }) =>
    `Write \`${at}\` as a value of its own, leaving the definition alone`,
  'intent.add-a-table-row': ({ anchor }) => `Add a row to the table at \`${anchor}\``,
  'intent.write-as-a-new-cell': ({ at }) => `Write \`${at}\` as a new cell`,
  'intent.write-into-the-file': ({ file }) =>
    `Write it into \`${file}\`, where the value comes from`,
  'intent.change-the-range-formula': ({ anchor, formula }) =>
    `Change the formula of the range at \`${anchor}\`${formula === '' ? '' : `, which reads \`=${formula}\` there`}`,
  'intent.split-the-range': ({ anchor, at }) =>
    `Split the range at \`${anchor}\` so \`${at}\` holds its own formula`,
  'intent.write-cells-of-their-own': ({ many }) =>
    `Write ${many} cell${many === 1 ? '' : 's'} of their own`,
  'intent.write-as-ranges': ({ many, axis }) =>
    `Write ${many === 1 ? 'one range' : `${many} ranges`}, one formula that moves with the ${axis}s`,
  'intent.a-chart': ({ type }) => `A ${type} chart`,
  'intent.take-out-of-outline': ({ span }) => `Take \`${span}\` out of the outline`,
  'intent.group-at-level': ({ span, level }) => `Group \`${span}\` at level ${level}`,
  'intent.which-is-many': ({ said, many, axis }, worded) =>
    `${worded(said)}, which is ${many} ${axis}s`,
  'intent.split-so-out': ({ span }) => `Split it so \`${span}\` alone is out`,
  'intent.split-so-shown': ({ span }) => `Split it so \`${span}\` alone is shown`,
  'intent.split-so-alone': ({ span }) => `Split it so \`${span}\` stands alone`,
  'intent.hide-span': ({ span }) => `Hide \`${span}\``,
  'intent.show-span': ({ span }) => `Show \`${span}\``,
  'intent.hide-the-band': ({ span }) => `Hide the band over \`${span}\``,
  'intent.show-the-band': ({ span }) => `Show the band over \`${span}\``,
  'intent.band-of-its-own': ({ axis }) => `Write a ${axis} of its own`,
  'intent.one-band-over': ({ span, axis }) => `Write one ${axis} band over \`${span}\``,
  'intent.change-the-band': ({ span }) => `Change the band over \`${span}\``,
  'intent.put-lines-in': (one) => `${lined(one, 'en')}, moving ${costing(one, 'en')}`,
  'intent.take-lines-away': (one) => `${lined(one, 'en')}, moving ${costing(one, 'en')}`,
};

const ja: Words<Says> = {
  'intent.no-such-sheet': ({ sheet }) => `\`${sheet}\` という名前のシートはありません`,
  'intent.nothing-writes-yet': ({ at }) => `\`${at}\` を書いているものはまだありません`,
  'intent.no-formula-to-change': ({ at }) => `\`${at}\` に変更できる数式はありません`,
  'intent.written-as-a-value': ({ at }) => `\`${at}\` は数式ではなく値として書かれています`,
  'intent.holds-a-formula': ({ at }) =>
    `\`${at}\` は数式です。変更するには \`=\` から始まる数式を入力してください`,
  'intent.holds-rich-text': ({ at }) =>
    `\`${at}\` はリッチテキストです。グリッド上のバーで部分ごとに編集してください`,
  'intent.reads-a-definition': ({ at }) =>
    `\`${at}\` は定義を読んでいます。他のセルも同じ定義を読んでいるため、ここで変えると他も変わります`,
  'intent.reads-a-parameter': ({ at, name }) => `\`${at}\` はパラメータ \`${name}\` を読んでいます`,
  'intent.reads-a-row': ({ at, row, file }) =>
    `\`${at}\` は \`${file}\` の ${row} 行目を読んでいます`,
  'intent.is-the-anchor': ({ at }) =>
    `\`${at}\` はこの範囲の唯一の数式が書かれている場所で、変更すると範囲が埋めるすべてのセルが変わります`,
  'intent.is-filled-by': ({ at, anchor }) =>
    `\`${at}\` は \`${anchor}\` を起点とする範囲が埋めています。この範囲は覆うセルすべてに 1 つの数式を書きます`,
  'intent.nothing-to-change-yet': ({ at, sheet }) =>
    `\`${sheet}\` の \`${at}\` には、まだ変更するものがありません`,
  'intent.no-place-in-the-file': () => 'このセルには、編集できる場所がファイル上にありません',
  'intent.file-unreadable': ({ file }) => `\`${file}\` を読めませんでした`,
  'intent.nothing-at-path': ({ path, file }) => `\`${file}\` の \`${path}\` には何もありません`,
  'intent.not-written-as-a-sheet': ({ sheet }) => `\`${sheet}\` はシートとして書かれていません`,
  'intent.kept-in-another-file': ({ sheet, what }) =>
    `\`${sheet}\` は${HELD.ja[what as HeldKey] ?? `\`${what}\``}を別のファイルに置いています`,
  'intent.some-cannot': ({ done, held, doing }) =>
    `ここの ${done + held.length} セルのうち ${held.length} セルは${DOING.ja[doing] ?? doing}ないため、どれも${DOING.ja[doing] ?? doing}ませんでした: ${grouped(held, 'ja')}`,
  'intent.one-cannot': ({ total, why, doing }, worded) =>
    `ここの ${total} セルのうち 1 セルは${DOING.ja[doing] ?? doing}ないため、どれも${DOING.ja[doing] ?? doing}ませんでした: ${worded(why)}`,
  'intent.write-as-override': ({ by, many }) =>
    `${many === 1 ? THE.ja[by] : `${THEY.ja[by]} ${many} セル`}を${
      by === 'definition' ? 'それぞれの値' : 'オーバーライド'
    }として書く`,
  'intent.cannot-be-written': ({ at, why }, worded) => `\`${at}\` は書き込めません: ${worded(why)}`,
  'intent.data-field-no-formula': ({ at }) =>
    `\`${at}\` は \`data:\` ブロックのフィールドで、数式を持てません`,
  'intent.not-as-overrides': () => 'これらのセルはオーバーライドとしては書けません',
  'intent.no-longer-a-definition': ({ at }) => `\`${at}\` はもう定義を読んでいません`,
  'intent.definition-takes-a-value': ({ at }) =>
    `\`${at}\` は数式を受け取ろうとしていますが、定義を読むセルはその代わりに値を取ります`,
  'intent.no-reference-to-write-over': ({ at }) => `\`${at}\` に上書きできる参照がありません`,
  'intent.across-two-files': ({ one, other }) =>
    `これらのセルは ${one} と ${other} にまたがって書かれており、このエディタは一度に 1 ファイルだけ書きます`,
  'intent.nothing-to-detach': () => 'ここには切り離すものがありません',
  'intent.these-cannot-be-written': ({ why }, worded) =>
    `これらのセルは書き込めません: ${worded(why)}`,
  'intent.sheet-not-a-mapping': () =>
    'これらのセルは書き込めません: シートがマッピングになっていません',
  'intent.rich-not-pasted': ({ at }) =>
    `\`${at}\` はリッチテキストで、このエディタは貼り付けません`,
  'intent.formula-cannot-move': ({ at, why }, worded) =>
    `\`${at}\` が持つ数式について: ${worded(why)}`,
  'intent.nothing-on-that-line': () => 'その行には何も書かれていないため、埋めるものがありません',
  'intent.not-a-cell-of-its-own': ({ at }) =>
    `\`${at}\` は独立したセルとして書かれていないため、テーブルが取り込めません`,
  'intent.more-than-a-value': ({ at }) =>
    `\`${at}\` は値以上のものを書いており、テーブルにはその置き場所がありません`,
  'intent.gather-across-files': () =>
    'これらのセルは複数のファイルに書かれており、一度にまとめられません',
  'intent.nothing-to-empty': () => 'この範囲には空にするものがありません',
  'intent.range-across-files': ({ files }) =>
    `この範囲は ${files} にまたがって書かれており、このエディタは一度に 1 ファイルだけ空にします`,
  'intent.no-filter-to-take-off': ({ sheet }) => `\`${sheet}\` に外せるフィルタはありません`,
  'intent.one-column-chart': ({ at }) =>
    `\`${at}\` は 1 列で、グラフは 1 列をその隣のラベルに対して描きます`,
  'intent.floats-from-a-parameter': () =>
    'これはパラメータが指す位置に浮いており、動かすとパラメータを上書きしてしまいます',
  'intent.not-a-float': () => 'これは浮きものとして書かれていません',
  'intent.a1-freezes-nothing': () =>
    '`A1` では何も固定されません。スクロールさせたい最初のセルで固定してください',
  'intent.split-and-freeze': ({ sheet }) =>
    `\`${sheet}\` は分割されています。シートは \`split\` と \`freeze\` の両方を持てません`,
  'intent.nothing-frozen': ({ sheet }) => `\`${sheet}\` に解除できる固定はありません`,
  'intent.no-such-band': ({ axis, at }) => `${at} ${axis === 'column' ? '列' : '行'}目はありません`,
  'intent.nothing-moves': (one) => `${spanned(one, 'ja')}を引いても、ここでは何も動きません`,
  'intent.band-across-files': (one) =>
    `${spanned(one, 'ja')}は複数のファイルにまたがっており、一度には書けません`,
  'intent.formula-would-break': ({ at, formula, why }, worded) =>
    `\`${at}\` は \`=${formula}\` を持っています: ${worded(why)}`,
  'intent.rows-from-file': ({ file }) =>
    `ここの行は \`${file}\` から来ており、そこに隙間を空けることはできません`,
  'intent.merge-needs-more': () =>
    '結合は 2 セル以上が対象です。ここには 1 つにまとめるものがありません',
  'intent.already-merged': ({ range }) =>
    `\`${range}\` はすでに結合されています。結合どうしは交差できません`,
  'intent.nothing-merged': () => 'ここには結合がありません',
  'intent.nothing-to-except': () => 'ここには例外にするものがありません',
  'intent.no-document-for-override': () =>
    'この spec には、オーバーライドを書き込むドキュメントがありません',
  'intent.range-keeps-its-formula': ({ at }) =>
    `\`${at}\` は範囲が唯一の数式を保持している場所で、ここにオーバーライドを置くと範囲が埋めるすべてのセルから数式が失われます。範囲を分割してください`,
  'intent.nothing-writes-it': ({ at }) =>
    `\`${at}\` は何にも書かれていないため、例外にする対象がありません`,
  'intent.cells-already-here': () => 'これらのセルはすでにここにあります',
  'intent.cut-overlaps': () =>
    '切り取りは、取り出す元のセルの上には置けません。範囲が重なっています',
  'intent.rect-across-files': ({ files }) =>
    `この矩形は ${files} にまたがって書かれることになり、このエディタは一度に 1 ファイルだけ書きます`,
  'intent.cut-not-in-a-spec': () => 'この切り取りが取り出すセルは spec ファイルにありません',
  'intent.cut-across-files': ({ from, to }) =>
    `この切り取りは ${from} から取り出して ${to} に書くことになり、このエディタは一度に 1 ファイルだけ書きます`,
  'intent.nothing-on-clipboard': () => 'クリップボードに貼り付けるものがありません',
  'intent.data-needs-empty-cells': () =>
    '`data:` ブロックは、まだ何も書いていないセルにしか置けません',
  'intent.not-a-mapping': () => 'このシートはマッピングになっていません',
  'intent.already-called-that': ({ name }) => `このシートはすでに \`${name}\` という名前です`,
  'intent.already-a-sheet-named': ({ name }) => `\`${name}\` という名前のシートはすでにあります`,
  'intent.no-place-to-rename': () => 'このシートには、名前を変更できる場所がファイル上にありません',
  'intent.named-formula-breaks': ({ what, why }, worded) =>
    `${what} が持つ数式について: ${worded(why)}`,
  'intent.named-across-files': ({ sheet }) =>
    `\`${sheet}\` は複数のファイルで名指しされており、一度には書き換えられません`,
  'intent.nothing-to-look-for': () => '検索する文字列がありません',
  'intent.nothing-holds-that': ({ sheet }) => `\`${sheet}\` にはもうそれを持つものがありません`,
  'intent.found-across-files': ({ files }) =>
    `見つかったものは ${files} にまたがって書かれており、このエディタは一度に 1 ファイルだけ書きます`,
  'intent.no-rich-text': ({ at }) => `\`${at}\` はリッチテキストを持っていません`,
  'intent.run-needs-something': () => '各部分には何か文字が必要です',
  'intent.not-written-as-rich': ({ at }) =>
    `\`${at}\` はここではリッチテキストとして書かれていません`,
  'intent.no-such-run': ({ at, runs, index }) =>
    `\`${at}\` の部分は ${runs} 個で、${index} 番目はありません`,
  'intent.run-not-text': ({ at, index }) =>
    `\`${at}\` の ${index} 番目の部分はテキストとして書かれていません`,
  'intent.run-reads-a-parameter': ({ at, index }) =>
    `\`${at}\` の ${index} 番目の部分はパラメータを読んでいます`,
  'intent.no-sheets-key': () => 'この spec には、シートを入れる `sheets:` がありません',
  'intent.workbook-needs-a-sheet': () => 'ブックにはシートが必要で、これが唯一のシートです',
  'intent.workbook-needs-a-shown-sheet': () =>
    'ブックには表示されるシートが必要で、これが唯一の表示シートです',
  'intent.named-by-cells': ({ sheet, shown, rest }) =>
    `\`${sheet}\` は ${shown}${rest === 0 ? '' : `、ほか ${rest} 件`}から名指しされており、それらが \`#REF!\` になってしまいます`,
  'intent.no-place-to-take-out': () => 'このシートには、取り出せる場所がファイル上にありません',
  'intent.override-no-place': () => 'このシートのオーバーライドには、ファイル上に場所がありません',
  'intent.take-out-across-files': ({ sheet }) =>
    `\`${sheet}\` は複数のファイルにまたがって書かれており、一度には取り出せません`,
  'intent.sheet-cannot-go-there': () => 'シートをそこへは移動できません',
  'intent.already-there': ({ sheet }) => `\`${sheet}\` はすでにそこにあります`,
  'intent.no-place-to-move': () => 'このシートには、移動できる場所がファイル上にありません',
  'intent.not-a-list-to-reorder': () => 'シートは、並べ替えられるリストとして書かれていません',
  'intent.very-hidden': ({ sheet }) =>
    `\`${sheet}\` は \`very_hidden\` で、これを戻せるのは Excel の VBA だけです`,
  'intent.very-hidden-not-written': () => '`very_hidden` はこのエディタでは書きません',
  'intent.nothing-would-change': () => 'このシートについて変わるものがありません',
  'intent.sort-needs-more-rows': () =>
    '並べ替えは 2 行以上が対象です。ここには並べ替えるものがありません',
  'intent.not-a-table-here': () =>
    'これらの行はここに書かれたテーブルではないため、並べ替える順序がありません',
  'intent.row-not-in-table': ({ row }) =>
    `${row} 行目はこのテーブルに書かれていないため、動かすものがありません`,
  'intent.rows-a-line-at-a-time': () => '1 行ずつ書かれた行の並べ替えには、まだ対応していません',
  'intent.already-in-that-order': () => 'これらの行はすでにその順序です',
  'intent.table-needs-more-rows': () =>
    'テーブルは 2 行以上が対象です。ここには基点にするものがありません',
  'intent.list-needs-a-choice': () => 'リストには選択肢が必要です',
  'intent.already-validated': ({ range }) =>
    `\`${range}\` にはすでに入力規則があります。セルが持てるのは一度に 1 つです`,
  'intent.no-note-to-take-off': ({ at }) => `\`${at}\` に外せるメモはありません`,
  'intent.note-needs-something': () => 'メモには何か文字が必要です',
  'intent.note-not-text': ({ at }) => `\`${at}\` のメモはテキストとして書かれていません`,
  'intent.change-the-parameter': ({ name }) =>
    `パラメータ \`${name}\` を変更する（読んでいるセルすべてが追随します）`,
  'intent.change-the-definition': ({ name }) =>
    `\`${name}\` を変更する（読んでいるセルすべてが追随します）`,
  'intent.write-as-its-own-value': ({ at }) =>
    `\`${at}\` をそれ自身の値として書く（定義はそのまま）`,
  'intent.add-a-table-row': ({ anchor }) => `\`${anchor}\` のテーブルに行を追加する`,
  'intent.write-as-a-new-cell': ({ at }) => `\`${at}\` を新しいセルとして書く`,
  'intent.write-into-the-file': ({ file }) => `値の出どころである \`${file}\` に書く`,
  'intent.change-the-range-formula': ({ anchor, formula }) =>
    `\`${anchor}\` の範囲の数式を変更する${formula === '' ? '' : `（そこでは \`=${formula}\` と読まれます）`}`,
  'intent.split-the-range': ({ anchor, at }) =>
    `\`${anchor}\` の範囲を分割して \`${at}\` に独自の数式を持たせる`,
  'intent.write-cells-of-their-own': ({ many }) => `${many} セルをそれぞれのセルとして書く`,
  'intent.write-as-ranges': ({ many, axis }) =>
    `${many} 個の範囲として書く（${axis === 'column' ? '列' : '行'}に沿って動く 1 つの数式）`,
  'intent.a-chart': ({ type }) => `${type} グラフ`,
  'intent.take-out-of-outline': ({ span }) => `\`${span}\` をアウトラインから外す`,
  'intent.group-at-level': ({ span, level }) => `\`${span}\` をレベル ${level} でグループ化する`,
  'intent.which-is-many': ({ said, many, axis }, worded) =>
    `${worded(said)}（${many} ${axis === 'column' ? '列' : '行'}が対象）`,
  'intent.split-so-out': ({ span }) => `\`${span}\` だけが外れるように分割する`,
  'intent.split-so-shown': ({ span }) => `\`${span}\` だけが表示されるように分割する`,
  'intent.split-so-alone': ({ span }) => `\`${span}\` だけが独立するように分割する`,
  'intent.hide-span': ({ span }) => `\`${span}\` を非表示にする`,
  'intent.show-span': ({ span }) => `\`${span}\` を再表示する`,
  'intent.hide-the-band': ({ span }) => `\`${span}\` にかかる帯を非表示にする`,
  'intent.show-the-band': ({ span }) => `\`${span}\` にかかる帯を再表示する`,
  'intent.band-of-its-own': ({ axis }) => `${axis === 'column' ? '列' : '行'}を単独で書く`,
  'intent.one-band-over': ({ span, axis }) =>
    `\`${span}\` にかかる${axis === 'column' ? '列' : '行'}の帯を 1 つ書く`,
  'intent.change-the-band': ({ span }) => `\`${span}\` にかかる帯を変更する`,
  'intent.put-lines-in': (one) => `${lined(one, 'ja')}（${costing(one, 'ja')}に影響）`,
  'intent.take-lines-away': (one) => `${lined(one, 'ja')}（${costing(one, 'ja')}に影響）`,
};

/** A run of rows or columns, as a refusal names it. */
function spanned(
  { axis, at, last }: { axis: string; at: number; last: number },
  language: Language,
): string {
  const one = axis === 'column' ? columnLabel(at) : String(at);
  const other = axis === 'column' ? columnLabel(last) : String(last);
  if (language === 'ja') {
    const unit = axis === 'column' ? '列' : '行';
    return at === last ? `${one} ${unit}` : `${one}〜${other} ${unit}`;
  }

  const word = axis === 'column' ? 'column' : 'row';
  return at === last ? `${word} ${one}` : `${word}s ${one}-${other}`;
}

/** What a line gesture does, as the answer offering it says so. */
function lined(
  one: { axis: string; many: number; at: number; last: number },
  language: Language,
): string {
  const span = spanned(one, language);
  if (language === 'ja') {
    const unit = one.axis === 'column' ? '列' : '行';
    return one.many < 0 ? `${span}を削除` : `${span}の上に ${one.many} ${unit}を挿入`;
  }

  const what = one.many === 1 ? one.axis : `${one.many} ${one.axis}s`;
  return one.many < 0 ? `Take ${span} away` : `Put ${what} in above ${span}`;
}

/** What a line gesture costs, in the lines of YAML it would touch and the cell keys among them. */
function costing(one: { things: number; keys: number }, language: Language): string {
  if (language === 'ja') {
    const all = `${one.things} 箇所`;
    return one.keys === 0 ? all : `${all}（うち ${one.keys} 件は \`cells:\` のキー）`;
  }

  const things = `${one.things} thing${one.things === 1 ? '' : 's'}`;
  if (one.keys === 0) return things;

  return `${things}, ${one.keys === one.things ? 'all' : one.keys} of them \`cells:\` keys`;
}

/** What stood in the way of several, counted by kind: one cell's own reason does not scale to five hundred. */
function grouped(held: readonly { at: string; by: Stood }[], language: Language): string {
  const kinds = [...new Set(held.map((one) => one.by))];

  return kinds
    .map((by) => {
      const many = held.filter((one) => one.by === by);
      if (many.length === 1) {
        return language === 'en'
          ? `\`${many[0]?.at}\` ${THE.en[by]}`
          : `\`${many[0]?.at}\` は${THE.ja[by]}`;
      }
      return language === 'en'
        ? `${many.length} ${THEY.en[by]}`
        : `${THEY.ja[by]} ${many.length} セル`;
    })
    .join(language === 'en' ? ', ' : '、');
}

/** The verb a refusal counts in, in the past: `emptied`, `pasted`, `replaced`. */
const DOING: Record<Language, Record<string, string>> = {
  en: { emptied: 'emptied', pasted: 'pasted', filled: 'filled', replaced: 'replaced' },
  ja: { emptied: '空にでき', pasted: '貼り付けられ', filled: '埋められ', replaced: '置換でき' },
};

/** What one such cell is. */
const THE: Record<Language, Record<Stood, string>> = {
  en: {
    range: 'is filled by a range',
    definition: 'reads a definition',
    parameter: 'reads a parameter',
    file: 'is read from a file beside the spec',
    data: 'is a field of a `data:` block',
    formula: 'holds a formula that cannot be moved here',
    rich: 'holds rich text',
    other: 'cannot be written',
  },
  ja: {
    range: '範囲に埋められています',
    definition: '定義を読んでいます',
    parameter: 'パラメータを読んでいます',
    file: 'spec の隣のファイルから読まれています',
    data: '`data:` ブロックのフィールドです',
    formula: 'ここへは動かせない数式です',
    rich: 'リッチテキストです',
    other: '書き込めません',
  },
};

/** What several of them are; the same list, said in a crowd. */
const THEY: Record<Language, Record<Stood, string>> = {
  en: {
    range: 'are filled by a range',
    definition: 'read a definition',
    parameter: 'read a parameter',
    file: 'are read from a file beside the spec',
    data: 'are fields of a `data:` block',
    formula: 'hold formulas that cannot be moved here',
    rich: 'hold rich text',
    other: 'cannot be written',
  },
  ja: {
    range: '範囲に埋められている',
    definition: '定義を読んでいる',
    parameter: 'パラメータを読んでいる',
    file: 'spec の隣のファイルから読まれている',
    data: '`data:` ブロックのフィールドである',
    formula: 'ここへは動かせない数式を持つ',
    rich: 'リッチテキストを持つ',
    other: '書き込めない',
  },
};

/** What a sheet keeps under each key, in the reader's word for it rather than the schema's. */
const HELD: Record<Language, Record<HeldKey, string>> = {
  en: {
    cells: 'cells',
    comments: 'notes',
    links: 'links',
    validations: 'validations',
    tables: 'tables',
    charts: 'charts',
    images: 'images',
    data: 'data blocks',
    formulas: 'formula ranges',
    merges: 'merges',
    columns: 'column bands',
    rows: 'row bands',
  },
  ja: {
    cells: 'セル',
    comments: 'メモ',
    links: 'リンク',
    validations: '入力規則',
    tables: 'テーブル',
    charts: 'グラフ',
    images: '画像',
    data: 'data ブロック',
    formulas: '数式の範囲',
    merges: '結合',
    columns: '列の帯',
    rows: '行の帯',
  },
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
