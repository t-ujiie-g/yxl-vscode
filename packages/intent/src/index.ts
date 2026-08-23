export { clearCell, clearRange } from './clear';
export {
  beside,
  excepting,
  type Intent,
  type Reading,
  reading,
  type Stood,
  setFormula,
  setValue,
  type Text,
} from './direct';
export { type Filling, setFilled } from './fill';
export { type Frozen, setFreeze } from './freeze';
export { type Grouping, setGroup } from './group';
export { type Hiding, setHidden } from './hidden';
export { drawLine, setLine } from './line';
export { type Merging, setMerged } from './merge';
export { overridable, override, type Says } from './override';
export {
  couldBlock,
  type Pasting,
  pasteRange,
  pasteText,
  type Shape,
  type Standing,
} from './paste';
export { type Renaming, renameSheet } from './renaming';
export { type Candidate, candidates, type Resolving } from './resolve';
export {
  type Adding,
  addSheet,
  type Deleting,
  deleteSheet,
  moveSheet,
  type Ordering,
} from './sheets';
export { type Does, lineSaid, type Moving, type Shift, shifting } from './shift';
export { type Dragged, setSize } from './size';
export { type Sorting, setSorted } from './sort';
export { type Projection, setStyle } from './style';
export { asTable, type Tabling } from './table';
export { tabular } from './tabular';
export { type Meaning, meaning } from './typed';
