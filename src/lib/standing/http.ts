import { fail, ok } from "@/lib/api/envelope";
import type { Result } from "./common";

/// A service result as the standard envelope: the data on success, the refusal's status, code, message and field details otherwise.
export function respond<T>(result: Result<T>) {
  return result.ok ? ok(result.data) : fail(result.message, result.status, result.code, result.details);
}

export const toAction = <T extends string>(action: T): Uppercase<T> => action.toUpperCase() as Uppercase<T>;
