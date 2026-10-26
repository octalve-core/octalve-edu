import { InvalidStorageKeyError, StorageError } from "./types";

// A storage key is a relative path of segments, each starting with a letter or digit and made of letters, digits, `_`, `.` and `-`: no empty segment, no `.` or `..`, no
// leading or trailing slash, no space, control character or percent sign, at most 200 characters. That keeps it one literal path in every backend (no signing or encoding
// surprises) and means a key built from user input can never climb out of its folder.

const KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/;

export const isStorageKey = (key: unknown): key is string => typeof key === "string" && key.length <= 200 && KEY.test(key);

export function assertStorageKey(key: unknown): string {
  if (!isStorageKey(key)) throw new InvalidStorageKeyError();
  return key;
}

// A content type is a lower-case media type, with no parameters, spaces or control characters, so it can never carry a second header into a request.
const CONTENT_TYPE = /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/;

export function assertContentType(contentType: unknown): string {
  if (typeof contentType !== "string" || contentType.length > 100 || !CONTENT_TYPE.test(contentType))
    throw new StorageError("Not a valid content type.");
  return contentType;
}
