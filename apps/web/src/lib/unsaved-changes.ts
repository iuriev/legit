/**
 * Whether the page holds edits that have not been saved. The editor writes it;
 * the code that would take the user away from the page reads it — the header's
 * sign-out, and the handling of an ended session — so that neither discards
 * edits behind the user's back.
 *
 * A plain object rather than React state: it is read at the moment of a click
 * or of a failed request, not rendered.
 */
export const unsavedChanges = {
  /** True while the editor's document differs from the saved one. */
  present: false,
  /** Set while the user has already agreed to leave, or there is nothing left to keep. */
  leaving: false,
};
