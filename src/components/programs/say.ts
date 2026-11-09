import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";

/// The words for a failed reply, or the fallback when the reply carries none.
export const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);
