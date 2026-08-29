import { type Book, type Nothing, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says; an id is stable, so it is API (ADR-051). */
export type Says = {
  'patch.nothing-to-write-over': Nothing;
  'patch.only-a-scalar': Nothing;
  'patch.no-key-to-rename': Nothing;
  'patch.nothing-to-put-back': Nothing;
  'patch.root-cannot-be-put-back': Nothing;
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'patch.nothing-to-write-over': () => 'nothing is there to write over',
  'patch.only-a-scalar': () => 'only a scalar can be written over and put back',
  'patch.no-key-to-rename': () => 'a rename puts back a key, and there is none here',
  'patch.nothing-to-put-back': () => 'nothing is there to put back',
  'patch.root-cannot-be-put-back': () => 'the document root cannot be put back',
};

const ja: Words<Says> = {
  'patch.nothing-to-write-over': () => 'そこには上書きするものがありません',
  'patch.only-a-scalar': () => '上書きして元に戻せるのはスカラーだけです',
  'patch.no-key-to-rename': () => '名前の変更はキーを戻すものですが、ここにキーがありません',
  'patch.nothing-to-put-back': () => 'そこには戻すものがありません',
  'patch.root-cannot-be-put-back': () => 'ドキュメントのルートは元に戻せません',
};

/** This package's sentences in every language, for the edge that renders them. */
export const WORDS: Book = { en, ja };
