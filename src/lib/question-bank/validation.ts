import { z } from "zod";

/// An id from a request: the shape of a cuid, nothing else (letters, digits, hyphen and underscore; anything else can only be a mistake or an attack).
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const idSchema = z.string().regex(ID_PATTERN, "That is not a valid id.");

/// Whether a piece of text holds a control, format (zero-width, bidi), private-use, unassigned or lone-surrogate character. Whitespace is collapsed before this is asked.
/// A NUL cannot be stored at all, and the others only ever make two labels look the same while being different.
export const hasForbiddenCharacters = (text: string) => /\p{C}/u.test(text);
