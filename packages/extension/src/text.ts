import { type Book, type Nothing, type Saying, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence the host says for itself, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'host.no-chart-here': Nothing;
  'host.chart-is-a-shape': Nothing;
  'host.chart-done': { what: Saying };
  'host.nothing-to-fill': { axis: string };
  'host.one-range-or-each': Nothing;
  'host.fill-done': { what: Saying };
  'host.cannot-hide': { span: string };
  'host.nothing-hides': { span: string };
  'host.band-over-more': { span: string };
  'host.hidden-done': { span: string };
  'host.shown-done': { span: string };
  'host.nothing-groups': { span: string };
  'host.cannot-group': { span: string };
  'host.grouped-done': { span: string };
  'host.ungrouped-done': { span: string };
  'host.nothing-moves': { span: string };
  'host.moves-a-lot': { what: Saying; keys: number };
  'host.lines-taken-away': { span: string };
  'host.lines-put-in': { span: string };
  'host.no-look-here': Nothing;
  'host.look-is-an-exception': Nothing;
  'host.look-from-different-places': Nothing;
  'host.look-is-shared': { many: number };
  'host.restyled': { many: number };
  'host.no-width-here': { span: string };
  'host.size-from-a-band': { span: string };
  'host.resized': { span: string };
  'host.answer-is-gone': Nothing;
  'host.not-a-sheet-name': { name: string };
  'host.cells-changed': { what: Saying; many: number };
  'host.empty-the-ones': Nothing;
  'host.paste-the-ones': Nothing;
  'host.replace-the-ones': Nothing;
  'host.and-the-rest': { what: Saying; doing: string };
  'host.cells-emptied': { many: number };
  'host.cells-pasted': { many: number };
  'host.cells-moved': { many: number };
  'host.cells-replaced': { many: number };
  'host.now-an-override': { at: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'host.no-chart-here': () =>
    'a chart plots a column against the labels beside it, and this is one column',
  'host.chart-is-a-shape': () =>
    'a chart is a shape as well as a range, and the shape is not in the selection — a stacked one is the same entry with the word changed',
  'host.chart-done': ({ what }, worded) => `${worded(what)} is over the cells you selected.`,
  'host.nothing-to-fill': ({ axis }) =>
    `nothing on the first ${axis === 'row' ? 'row' : 'column'} of this is written, so there is nothing to fill`,
  'host.one-range-or-each': () =>
    'a spec can hold this as one range or as a cell each, so it is worth saying which',
  'host.fill-done': ({ what }, worded) => `${worded(what).replace(/^W/, 'w')}: done.`,
  'host.cannot-hide': ({ span }) => `nothing here can hide ${span}`,
  'host.nothing-hides': ({ span }) => `nothing hides ${span}`,
  'host.band-over-more': ({ span }) =>
    `${span} take that from a band over more than them, so there is more than one way to change it`,
  'host.hidden-done': ({ span }) => `${span} hidden.`,
  'host.shown-done': ({ span }) => `${span} shown again.`,
  'host.nothing-groups': ({ span }) => `nothing groups ${span}`,
  'host.cannot-group': ({ span }) => `nothing here can group ${span}`,
  'host.grouped-done': ({ span }) => `${span} grouped.`,
  'host.ungrouped-done': ({ span }) => `${span} taken out of the outline.`,
  'host.nothing-moves': ({ span }) => `nothing here moves when ${span} is drawn`,
  'host.moves-a-lot': ({ what, keys }, worded) =>
    `this moves more than a handful of things, so it is worth seeing first: ${worded(what)}${
      keys > 0 ? ' — a `data:` table keeps its addresses in one place, and moves in one line' : ''
    }`,
  'host.lines-taken-away': ({ span }) => `${span} taken away.`,
  'host.lines-put-in': ({ span }) => `${span} put in.`,
  'host.no-look-here': () => 'nothing here can carry that look',
  'host.look-is-an-exception': () =>
    'a formula range fills this cell, so a look on it is either an exception or the whole run',
  'host.look-from-different-places': () =>
    'the cells here take that look from different places, so there is more than one way to change it',
  'host.look-is-shared': ({ many }) =>
    `this look comes from something ${many} cell${many === 1 ? '' : 's'} read, so there is more than one way to change it`,
  'host.restyled': ({ many }) => `${many} cell${many === 1 ? '' : 's'} restyled.`,
  'host.no-width-here': ({ span }) => `nothing here can say how wide ${span} is`,
  'host.size-from-a-band': ({ span }) =>
    `${span} takes its size from a band over more than that, so there is more than one way to change it`,
  'host.resized': ({ span }) => `${span} resized.`.replace(/^./, (one) => one.toUpperCase()),
  'host.answer-is-gone': () => 'that answer is no longer one of the ways this edit could be made',
  'host.not-a-sheet-name': ({ name }) => `\`${name}\` is not a name a sheet can have`,
  'host.cells-changed': ({ what, many }, worded) =>
    `${worded(what).replace(/^C/, 'c')}: ${many} cells changed.`,
  'host.empty-the-ones': () => 'Empty the ones that can be',
  'host.paste-the-ones': () => 'Paste into the ones that can take it',
  'host.replace-the-ones': () => 'Replace the ones that can be',
  'host.and-the-rest': ({ what, doing }, worded) => `${worded(what)}, and ${doing} the rest`,
  'host.cells-emptied': ({ many }) => `${many} cell${many === 1 ? '' : 's'} emptied.`,
  'host.cells-pasted': ({ many }) => `${many} cell${many === 1 ? '' : 's'} pasted.`,
  'host.cells-moved': ({ many }) => `${many} cell${many === 1 ? '' : 's'} moved.`,
  'host.cells-replaced': ({ many }) => `${many} cell${many === 1 ? '' : 's'} replaced.`,
  'host.now-an-override': ({ at }) => `${at} is now written as an override.`,
};

const ja: Words<Says> = {
  'host.no-chart-here': () =>
    'グラフは 1 列をその隣のラベルに対して描きますが、ここは 1 列だけです',
  'host.chart-is-a-shape': () =>
    'グラフは範囲であると同時に図形でもあり、その図形は選択範囲に含まれていません。積み上げにするには、同じエントリの語を変えます',
  'host.chart-done': ({ what }, worded) => `${worded(what)}を選択したセルの上に置きました。`,
  'host.nothing-to-fill': ({ axis }) =>
    `この範囲の最初の${axis === 'row' ? '行' : '列'}には何も書かれていないため、埋めるものがありません`,
  'host.one-range-or-each': () =>
    'spec はこれを 1 つの範囲としても、セルごとにも持てます。どちらにするか決めてください',
  'host.fill-done': ({ what }, worded) => `${worded(what)}: 完了しました。`,
  'host.cannot-hide': ({ span }) => `ここでは${span}を非表示にできません`,
  'host.nothing-hides': ({ span }) => `${span}を非表示にしているものはありません`,
  'host.band-over-more': ({ span }) =>
    `${span}はより広い帯からその指定を受け取っているため、変更する方法が複数あります`,
  'host.hidden-done': ({ span }) => `${span}を非表示にしました。`,
  'host.shown-done': ({ span }) => `${span}を再表示しました。`,
  'host.nothing-groups': ({ span }) => `${span}をグループ化しているものはありません`,
  'host.cannot-group': ({ span }) => `ここでは${span}をグループ化できません`,
  'host.grouped-done': ({ span }) => `${span}をグループ化しました。`,
  'host.ungrouped-done': ({ span }) => `${span}をアウトラインから外しました。`,
  'host.nothing-moves': ({ span }) => `${span}を引いても、ここでは何も動きません`,
  'host.moves-a-lot': ({ what, keys }, worded) =>
    `これは多くの箇所を動かすので、先に確認する価値があります: ${worded(what)}${
      keys > 0 ? ' — `data:` テーブルは住所を 1 か所にまとめており、1 行で動きます' : ''
    }`,
  'host.lines-taken-away': ({ span }) => `${span}を削除しました。`,
  'host.lines-put-in': ({ span }) => `${span}を挿入しました。`,
  'host.no-look-here': () => 'ここにはその書式を持たせられません',
  'host.look-is-an-exception': () =>
    'このセルは数式の範囲が埋めているため、書式は例外にするか、範囲全体に付けるかのどちらかです',
  'host.look-from-different-places': () =>
    'ここのセルはそれぞれ別の場所から書式を受け取っているため、変更する方法が複数あります',
  'host.look-is-shared': ({ many }) =>
    `この書式は ${many} セルが読んでいるものから来ているため、変更する方法が複数あります`,
  'host.restyled': ({ many }) => `${many} セルの書式を変えました。`,
  'host.no-width-here': ({ span }) => `ここでは${span}の幅を指定できません`,
  'host.size-from-a-band': ({ span }) =>
    `${span}はより広い帯からサイズを受け取っているため、変更する方法が複数あります`,
  'host.resized': ({ span }) => `${span}のサイズを変えました。`,
  'host.answer-is-gone': () => 'その答えは、この編集を行う方法ではなくなりました',
  'host.not-a-sheet-name': ({ name }) => `\`${name}\` はシート名として使えません`,
  'host.cells-changed': ({ what, many }, worded) => `${worded(what)}: ${many} セルを変更しました。`,
  'host.empty-the-ones': () => '空にできるものだけ空にする',
  'host.paste-the-ones': () => '受け取れるセルにだけ貼り付ける',
  'host.replace-the-ones': () => '置換できるものだけ置換する',
  'host.and-the-rest': ({ what, doing }, worded) =>
    `${worded(what)}、残りは${doing === 'paste' ? '貼り付ける' : '書き込む'}`,
  'host.cells-emptied': ({ many }) => `${many} セルを空にしました。`,
  'host.cells-pasted': ({ many }) => `${many} セルを貼り付けました。`,
  'host.cells-moved': ({ many }) => `${many} セルを移動しました。`,
  'host.cells-replaced': ({ many }) => `${many} セルを置換しました。`,
  'host.now-an-override': ({ at }) => `${at} をオーバーライドとして書きました。`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
