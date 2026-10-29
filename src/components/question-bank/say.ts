import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, type Reply } from "@/components/auth/postJson";

/// What to tell the person when a call failed: the server's own words when it gave some, otherwise `fallback`.
export const say = (reply: Reply, fallback: string) =>
  reply.status === 401
    ? SESSION_ENDED
    : reply.status === 429
      ? (reply.message ?? RATE_LIMITED)
      : reply.status === 0
        ? NETWORK_ERROR
        : (reply.message ?? fallback);
