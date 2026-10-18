import crypto from "node:crypto";
import { devToolsEnabled } from "@/lib/dev-tools";

export interface TermiiSendParams {
  to: string; // Recipient phone number
  message: string;
  channel?: "generic" | "dnd" | "whatsapp";
  mediaUrl?: string;
  caption?: string;
}

export interface TermiiSendResult {
  success: boolean;
  messageId?: string;
  balance?: number;
  error?: string;
}

/**
 * Normalizes a phone number to Nigerian MSISDN format without the leading '+'.
 * E.g., '08012345678' -> '2348012345678'
 *       '+2348012345678' -> '2348012345678'
 *       '2348012345678' -> '2348012345678'
 */
export function normalizeNigerianPhoneNumber(input: string): string {
  const cleaned = input.trim().replace(/[\s\-\(\)]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned.slice(1);
  }

  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "234" + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Validates if the phone number is a valid MSISDN (Nigerian standard or international).
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizeNigerianPhoneNumber(phone);
  // Nigerian format: 234 + 10 digits starting with 7, 8, or 9
  const nigerianRegex = /^234[789][01]\d{8}$/;
  // General E.164 without plus: 8 to 15 digits
  const generalRegex = /^\d{8,15}$/;

  return nigerianRegex.test(normalized) || generalRegex.test(normalized);
}

// In-memory mock storage for development & testing inspection
export interface MockTermiiMessage {
  id: string;
  to: string;
  from: string;
  message: string;
  channel: string;
  sentAt: string;
}

const mockMessages: MockTermiiMessage[] = [];

export function getMockTermiiMessages(): MockTermiiMessage[] {
  return [...mockMessages];
}

export function clearMockTermiiMessages(): void {
  mockMessages.length = 0;
}

/**
 * Sends an SMS or WhatsApp message via Termii API.
 * Uses mock delivery in development, testing, or when TERMII_API_KEY is not set.
 */
export async function sendTermiiMessage(params: TermiiSendParams): Promise<TermiiSendResult> {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID || "OctalveEdu";
  const channel = params.channel || "generic";
  const normalizedPhone = normalizeNigerianPhoneNumber(params.to);

  if (!isValidPhoneNumber(normalizedPhone)) {
    return {
      success: false,
      error: `Invalid phone number format: "${params.to}"`,
    };
  }

  // Mock / Development mode
  if (!apiKey || process.env.NODE_ENV === "test" || devToolsEnabled()) {
    const mockId = `termii-mock-${crypto.randomUUID()}`;
    const mockRecord: MockTermiiMessage = {
      id: mockId,
      to: normalizedPhone,
      from: senderId,
      message: params.message,
      channel,
      sentAt: new Date().toISOString(),
    };
    mockMessages.push(mockRecord);

    if (process.env.NODE_ENV !== "test") {
      console.log(`[TERMII MOCK ${channel.toUpperCase()} → ${normalizedPhone}] ${params.message}`);
    }

    return {
      success: true,
      messageId: mockId,
    };
  }

  // Production API Call
  try {
    const endpoint = "https://api.ng.termii.com/api/sms/send";
    const payload = {
      to: normalizedPhone,
      from: senderId,
      sms: params.message,
      type: "plain",
      channel,
      api_key: apiKey,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Termii HTTP error ${res.status}`,
      };
    }

    return {
      success: true,
      messageId: data.message_id || data.messageId,
      balance: data.balance,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Termii network request failed",
    };
  }
}
