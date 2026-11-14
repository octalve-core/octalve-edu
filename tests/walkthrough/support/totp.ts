import { createHmac } from "crypto";

// A stand-in for the authenticator app on a person's phone (task 0033, section 6.18): it is given the setup key the screen shows, and gives the six-digit code the app would show. RFC 6238 over
// RFC 4226 with HMAC-SHA1, six digits, thirty seconds: what every authenticator app does, and written here on purpose rather than imported from the product, so that the walkthrough does not
// check the product's code with itself. Checked against the RFC's own published test vectors (support/totp.spec.ts).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

/// A character that is not in the alphabet stops the decoding, with the character named.
const notBase32 = (char: string): never => {
  throw new Error(`"${char}" is not in a base32 setup key.`);
};

/// The setup key as shown on the screen (groups of four, upper case) to its bytes: five bits a character, whole bytes kept.
export function base32Decode(key: string): Buffer {
  const clean = key.replace(/[\s=-]+/g, "").toUpperCase();
  const bits = [...clean]
    .map((char) => (ALPHABET.includes(char) ? ALPHABET.indexOf(char).toString(2).padStart(5, "0") : notBase32(char)))
    .join("");
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}

export const stepAt = (ms: number): number => Math.floor(ms / 1000 / STEP_SECONDS);

/// RFC 4226: the code for one counter value.
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const totpAt = (secret: Buffer, ms: number, digits = 6): string => hotp(secret, stepAt(ms), digits);

/// The phone. The product refuses a code from a step it has already accepted, so a person who has just used a code waits for the app to show the next one: `nextCode` does the same, up to thirty
/// seconds, and never gives two codes from one step.
export class Authenticator {
  private lastStep = -1;
  readonly secret: Buffer;

  constructor(setupKey: string) {
    this.secret = base32Decode(setupKey);
  }

  async nextCode(): Promise<string> {
    const now = Date.now();
    const stillSpent = stepAt(now) <= this.lastStep;
    await new Promise((resolve) => setTimeout(resolve, stillSpent ? (this.lastStep + 1) * STEP_SECONDS * 1000 - now + 250 : 0));
    this.lastStep = stepAt(Date.now());
    return hotp(this.secret, this.lastStep);
  }
}
