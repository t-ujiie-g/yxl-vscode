import type { FacetOrigin } from './provenance';
import type { StyleLayer } from './style';

/**
 * What happens when someone edits this facet (ADR-006).
 *
 * Derived from where the facet came from and from nothing else, so that the UI
 * holds no second opinion about what is editable: a phase that adds an origin
 * gets its behaviour here, once.
 *
 * - `direct` — one change in the spec says it, so the edit applies.
 * - `mediated` — several would, and picking for the user is the one thing this
 *   editor does not do (ADR-001), so it asks.
 * - `external` — the value lives in a file beside the spec: edit that, or
 *   divert the edit to `overrides:` (ADR-007).
 * - `readonly` — nothing in the spec can carry the edit, and the UI says why.
 */
export type Editability = 'direct' | 'mediated' | 'external' | 'readonly';

/**
 * How editable a value or a format is.
 *
 * `empty` is `mediated` rather than refused: a cell nothing wrote can be
 * written, and that gesture has two candidates — a new `cells:` entry, or
 * extending the `data:` rectangle next to it — which is what asking is for.
 * Nothing is `readonly` yet: that answer belongs to a sealed region and to an
 * evaluated result, and both arrive with the work that introduces them.
 */
export function editabilityOf(origin: FacetOrigin): Editability {
  switch (origin.kind) {
    case 'literal':
    case 'inline':
    case 'override':
      return 'direct';
    case 'external':
      return 'external';
    default:
      return 'mediated';
  }
}

/**
 * How editable one property of a look is, from the layer that supplies it.
 *
 * A definition is `mediated` however it was reached: forty cells may wear it,
 * so the answer is a choice between changing them all and forking this one
 * A band is `mediated` for the same reason at column scale. What the
 * cell itself said, or an override did, is one node and applies directly.
 */
export function editabilityOfLayer(layer: StyleLayer): Editability {
  if (layer.name !== null) return 'mediated';
  return layer.through === 'column' || layer.through === 'row' ? 'mediated' : 'direct';
}
