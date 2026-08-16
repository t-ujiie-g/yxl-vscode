/** Every diagnostic this package can raise; a code is stable and greppable, so it is API. */
export const CODE = {
  alias: 'cst.alias',
  unexpectedToken: 'cst.unexpected-token',
  nonStringKey: 'cst.non-string-key',
  multipleDocuments: 'cst.multiple-documents',
  noSuchPath: 'cst.no-such-path',
  notAKey: 'cst.not-a-key',
  notASequence: 'cst.not-a-sequence',
  notAMapping: 'cst.not-a-mapping',
  keyExists: 'cst.key-exists',
  emptyMapping: 'cst.empty-mapping',
  emptyBlockScalar: 'cst.empty-block-scalar',
  noSuchKey: 'cst.no-such-key',
  cannotRemoveRoot: 'cst.cannot-remove-root',
  flowNotSupported: 'cst.flow-not-supported',
  blockScalarNotSupported: 'cst.block-scalar-not-supported',
  emptySequence: 'cst.empty-sequence',
  itemMarker: 'cst.item-marker',
  overlappingEdits: 'cst.overlapping-edits',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
