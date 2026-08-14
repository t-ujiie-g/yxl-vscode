/**
 * Every diagnostic this package can raise.
 *
 * A code is stable and greppable, so it is API: it appears in messages users
 * report and in tests that pin behaviour. Naming them in one place keeps the
 * `cst.` prefix from being spelled at each throw site and makes the set
 * readable as a whole.
 */
export const CODE = {
  alias: 'cst.alias',
  unexpectedToken: 'cst.unexpected-token',
  nonStringKey: 'cst.non-string-key',
  multipleDocuments: 'cst.multiple-documents',
  noSuchPath: 'cst.no-such-path',
  notAKey: 'cst.not-a-key',
  notASequence: 'cst.not-a-sequence',
  cannotRemoveRoot: 'cst.cannot-remove-root',
  flowNotSupported: 'cst.flow-not-supported',
  emptySequence: 'cst.empty-sequence',
  overlappingEdits: 'cst.overlapping-edits',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
