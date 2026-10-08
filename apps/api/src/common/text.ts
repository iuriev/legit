/**
 * Control characters (which include the NUL that PostgreSQL cannot store) and
 * the characters that override the direction of text, which can make a line
 * read differently from what it says.
 */
const UNSAFE_CHARACTERS = /[\p{Cc}‪-‮⁦-⁩]+/gu;

/**
 * Text from outside (a quoted passage, a question of the model, an answer of
 * the user) as one plain line: unsafe characters removed, whitespace collapsed.
 */
export function toPlainLine(text: string): string {
  return text.replace(UNSAFE_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
}
