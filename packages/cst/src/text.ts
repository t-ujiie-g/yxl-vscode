import { type Book, type Nothing, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'cst.not-a-sequence': { path: string };
  'cst.not-a-mapping': { path: string };
  'cst.holds-no-entries': { path: string };
  'cst.not-a-key': { path: string };
  'cst.no-such-path': { path: string };
  'cst.no-such-key': { key: string };
  'cst.key-exists': { key: string };
  'cst.inside-flow': { path: string };
  'cst.carries-the-dash': { path: string };
  'cst.block-scalar': { path: string };
  'cst.no-item-to-copy': { path: string };
  'cst.no-entry-to-copy': { path: string };
  'cst.nothing-left-beside': { path: string };
  'cst.blank-line-under': { path: string };
  'cst.only-entry-here': { path: string };
  'cst.lines-above': { path: string };
  'cst.empty-block-scalar': Nothing;
  'cst.cannot-remove-root': Nothing;
  'cst.overlapping-edits': Nothing;
  'cst.multiple-documents': Nothing;
  'cst.alias': Nothing;
  'cst.non-string-key': Nothing;
  'cst.unexpected-token': { token: string };
  'cst.expected-scalar': { token: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'cst.not-a-sequence': ({ path }) => `\`${path}\` is not a sequence`,
  'cst.not-a-mapping': ({ path }) => `\`${path}\` is not a mapping`,
  'cst.holds-no-entries': ({ path }) => `\`${path}\` holds no entries`,
  'cst.not-a-key': ({ path }) => `\`${path}\` is not a mapping entry`,
  'cst.no-such-path': ({ path }) => `nothing at \`${path}\``,
  'cst.no-such-key': ({ key }) => `nothing is keyed \`${key}\` here`,
  'cst.key-exists': ({ key }) => `\`${key}\` is already there`,
  'cst.inside-flow': ({ path }) =>
    `\`${path}\` is inside a flow collection, which this editor does not rewrite yet`,
  'cst.carries-the-dash': ({ path }) =>
    `\`${path}\` carries the \`- \` that opens its item, which this editor does not move`,
  'cst.block-scalar': ({ path }) =>
    `\`${path}\` is a block scalar, which this editor does not empty`,
  'cst.no-item-to-copy': ({ path }) => `\`${path}\` has no item to take its layout from`,
  'cst.no-entry-to-copy': ({ path }) => `\`${path}\` has no entry to take its layout from`,
  'cst.nothing-left-beside': ({ path }) => `\`${path}\` has nothing left to put it back beside`,
  'cst.blank-line-under': ({ path }) =>
    `\`${path}\` has a blank line under it that would not be where it was`,
  'cst.only-entry-here': ({ path }) =>
    `\`${path}\` is the only entry here, and nothing would be left to put it back beside`,
  'cst.lines-above': ({ path }) =>
    `\`${path}\` has lines above it that would not be where they were`,
  'cst.empty-block-scalar': () => 'this block scalar has no body to take its layout from',
  'cst.cannot-remove-root': () => 'the document root cannot be removed',
  'cst.overlapping-edits': () => 'two edits cover the same text',
  'cst.multiple-documents': () => 'a spec holds one document; the rest are ignored',
  'cst.alias': () => 'YAML aliases are not supported; name the value in `defs:` and reference it',
  'cst.non-string-key': () => 'a mapping key must be text',
  'cst.unexpected-token': ({ token }) => `unexpected ${token}`,
  'cst.expected-scalar': ({ token }) => `expected a scalar, found ${token}`,
};

const ja: Words<Says> = {
  'cst.not-a-sequence': ({ path }) => `\`${path}\` はシーケンスではありません`,
  'cst.not-a-mapping': ({ path }) => `\`${path}\` はマッピングではありません`,
  'cst.holds-no-entries': ({ path }) => `\`${path}\` はエントリを持っていません`,
  'cst.not-a-key': ({ path }) => `\`${path}\` はマッピングのエントリではありません`,
  'cst.no-such-path': ({ path }) => `\`${path}\` には何もありません`,
  'cst.no-such-key': ({ key }) => `ここに \`${key}\` というキーはありません`,
  'cst.key-exists': ({ key }) => `\`${key}\` はすでにあります`,
  'cst.inside-flow': ({ path }) =>
    `\`${path}\` はフローコレクションの中にあり、このエディタはまだ書き換えられません`,
  'cst.carries-the-dash': ({ path }) =>
    `\`${path}\` は項目を開く \`- \` を持っており、このエディタはこれを動かしません`,
  'cst.block-scalar': ({ path }) =>
    `\`${path}\` はブロックスカラーで、このエディタはこれを空にしません`,
  'cst.no-item-to-copy': ({ path }) => `\`${path}\` には書き方をまねる項目がありません`,
  'cst.no-entry-to-copy': ({ path }) => `\`${path}\` には書き方をまねるエントリがありません`,
  'cst.nothing-left-beside': ({ path }) => `\`${path}\` には戻す先の隣がもう残っていません`,
  'cst.blank-line-under': ({ path }) => `\`${path}\` の下には空行があり、元の位置には戻せません`,
  'cst.only-entry-here': ({ path }) =>
    `\`${path}\` はここにある唯一のエントリで、戻す先の隣が残りません`,
  'cst.lines-above': ({ path }) => `\`${path}\` の上には元の位置に戻らない行があります`,
  'cst.empty-block-scalar': () => 'このブロックスカラーには書き方をまねる本文がありません',
  'cst.cannot-remove-root': () => 'ドキュメントのルートは削除できません',
  'cst.overlapping-edits': () => '2 つの編集が同じ範囲にかかっています',
  'cst.multiple-documents': () => 'spec が持つドキュメントは 1 つで、残りは無視されます',
  'cst.alias': () =>
    'YAML のエイリアスには対応していません。`defs:` で名前を付けて参照してください',
  'cst.non-string-key': () => 'マッピングのキーは文字列でなければなりません',
  'cst.unexpected-token': ({ token }) => `予期しない ${token} です`,
  'cst.expected-scalar': ({ token }) => `スカラーを期待しましたが ${token} でした`,
};

/** This package's sentences in every language, for the edge that renders them. */
export const WORDS: Book = { en, ja };
