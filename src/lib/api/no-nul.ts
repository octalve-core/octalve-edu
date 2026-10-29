// One check for every route that takes input from a request (query string, JSON body, path segments).
//
// PostgreSQL cannot store a NUL character in text (or in JSON), so a string that holds one reaches the database as an error and the caller sees a 500. A request
// that holds one is refused before any handler runs: validate() does it for the JSON body, withAuth() for the path segments and the query string. A NUL never means
// anything in a name, a note, a search or an id, so no route needs it and the refusal is the same everywhere.

const NUL = String.fromCharCode(0);

/// What the person is told when a request is refused for it.
export const NUL_MESSAGE = "A value contains a character that cannot be stored.";

/// True when `value` is, or holds anywhere (in an array, in an object's values, in an object's KEYS), a string with a NUL character in it. Only what comes from a
/// parsed JSON body, a query string or a path is looked at: strings, arrays and plain objects; numbers, booleans and null are never a problem.
///
/// Iterative on purpose: a body of a million opening brackets is a million levels deep, and a recursive walk would run out of stack on it (a 500 of its own).
export function holdsNul(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === "string") {
      if (item.includes(NUL)) return true;
    } else if (Array.isArray(item)) {
      for (const child of item) pending.push(child);
    } else if (item !== null && typeof item === "object") {
      for (const key of Object.keys(item)) {
        if (key.includes(NUL)) return true;
        pending.push((item as Record<string, unknown>)[key]);
      }
    }
  }
  return false;
}
