/** Escapes LIKE/ILIKE wildcards (and the escape character) so they match literally. */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
