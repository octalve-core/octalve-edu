import { NextRequest, NextResponse } from "next/server";
import { processPaystackWebhook } from "@/lib/finance/service";
import { resolvePaystackMode } from "@/lib/finance/paystack";

// POST /api/v1/webhooks/paystack
// Public webhook endpoint for Paystack payment notifications (plan "Fix design - Phase 1 review findings", F2-F3).
//   401  unsigned or wrongly signed: nothing is written
//   503  not configured, or a TRANSIENT failure (database, network): the provider retries, and a retry takes the idempotent path
//   200  processed, ignored, a duplicate, or a deliberate refusal (amount mismatch...) that retrying cannot change
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: NextRequest) {
  const mode = resolvePaystackMode();
  if (mode.kind === "not-configured" || mode.kind === "mock-refused") {
    return NextResponse.json({ received: false, error: "Payments are not configured." }, { status: 503 });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ received: false, error: "Payload too large." }, { status: 413 });
  }
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ received: false, error: "Payload too large." }, { status: 413 });
  }

  try {
    const result = await processPaystackWebhook(rawBody, req.headers.get("x-paystack-signature"), mode.secret);
    switch (result.status) {
      case "invalid_signature":
        return NextResponse.json({ received: false, status: "invalid_signature" }, { status: 401 });
      case "retry":
        return NextResponse.json({ received: false, status: "retry" }, { status: 503 });
      case "refused":
        return NextResponse.json({ received: true, status: "refused", eventId: result.eventId, error: result.error });
      default:
        return NextResponse.json({
          received: true,
          status: result.status,
          eventId: result.eventId,
          ...("duplicate" in result && result.duplicate ? { duplicate: true } : {}),
        });
    }
  } catch (err: unknown) {
    // Anything unforeseen is transient from the provider's point of view: log it here, say nothing about it, ask for a retry.
    console.error("[PAYSTACK_WEBHOOK_ERROR]", err);
    return NextResponse.json({ received: false, status: "retry" }, { status: 503 });
  }
}
