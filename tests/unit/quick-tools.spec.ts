import { test, expect } from "@playwright/test";
import manifest from "@/app/manifest";
import { createBroadcastSchema } from "@/lib/communication/http";
import {
  evaluateArithmetic,
  formatCalculation,
  applyDiscountWaiver,
  applyTaxSurcharge,
} from "@/lib/tools/calculator";

test.describe("Universal School Calculator — Pure Arithmetic Engine", () => {
  test("basic arithmetic operations (+, -, *, /)", () => {
    expect(evaluateArithmetic("150 + 50")).toBe(200);
    expect(evaluateArithmetic("500 - 125")).toBe(375);
    expect(evaluateArithmetic("25 * 40")).toBe(1000);
    expect(evaluateArithmetic("1000 / 8")).toBe(125);
  });

  test("unicode operator symbols (×, ÷, −) supported by keypad", () => {
    expect(evaluateArithmetic("250 × 4")).toBe(1000);
    expect(evaluateArithmetic("500 ÷ 2")).toBe(250);
    expect(evaluateArithmetic("100 − 35")).toBe(65);
  });

  test("parenthesized complex expressions", () => {
    expect(evaluateArithmetic("(15000 + 5000) * 2")).toBe(40000);
    expect(evaluateArithmetic("((100 - 20) * 5) / 2")).toBe(200);
  });

  test("percentage calculation inside expression", () => {
    // 50000 * 10% = 5000
    expect(evaluateArithmetic("50000 * 10%")).toBe(5000);
    // 200000 * 95% = 190000 (5% sibling discount)
    expect(evaluateArithmetic("200000 * 95%")).toBe(190000);
  });

  test("division by zero returns Infinity or is flagged", () => {
    const res = evaluateArithmetic("500 / 0");
    expect(res).toBeNull(); // finite number check catches Infinity
  });

  test("invalid or malicious code expressions are rejected cleanly", () => {
    expect(evaluateArithmetic("process.exit(1)")).toBeNull();
    expect(evaluateArithmetic("alert(1)")).toBeNull();
    expect(evaluateArithmetic("require('fs')")).toBeNull();
    expect(evaluateArithmetic("")).toBeNull();
    expect(evaluateArithmetic("   ")).toBeNull();
  });

  test("formatCalculation formats thousands with commas and limits decimals", () => {
    expect(formatCalculation(150000)).toBe("150,000");
    expect(formatCalculation(2450.75)).toBe("2,450.75");
    expect(formatCalculation(0)).toBe("0");
  });

  test("school fee discount waiver calculations", () => {
    // 5% Sibling Discount on 200,000 tuition
    expect(applyDiscountWaiver(200000, 5)).toBe(190000);
    // 10% Staff Child Discount on 150,000 tuition
    expect(applyDiscountWaiver(150000, 10)).toBe(135000);
    // Out of bounds discount yields unchanged
    expect(applyDiscountWaiver(100000, -5)).toBe(100000);
    expect(applyDiscountWaiver(100000, 105)).toBe(100000);
  });

  test("tax and surcharge additions", () => {
    // 7.5% VAT / card surcharge on 50,000 fee
    expect(applyTaxSurcharge(50000, 7.5)).toBe(53750);
  });
});

test.describe("PWA Web App Manifest Configuration", () => {
  test("manifest provides standalone display, metadata and launcher shortcuts", () => {
    const mf = manifest();

    expect(mf.display).toBe("standalone");
    expect(mf.theme_color).toBe("#0f172a");
    expect(mf.shortcuts).toBeDefined();
    expect(mf.shortcuts?.length).toBeGreaterThanOrEqual(4);

    const shortcutUrls = mf.shortcuts?.map((s) => s.url);
    expect(shortcutUrls).toContain("/dashboard?tool=calculator");
    expect(shortcutUrls).toContain("/dashboard?tool=payment-recorder");
    expect(shortcutUrls).toContain("/dashboard?tool=payment-link");
    expect(shortcutUrls).toContain("/dashboard?tool=broadcast");
  });
});

test.describe("PWA QR Code Generation Engine", () => {
  test("generates valid base64 data URL for checkout authorization links", async () => {
    const qrcodeMod = await import("qrcode");
    const testUrl = "https://checkout.paystack.com/0013-test-auth-url";

    const dataUrl = await (qrcodeMod.default ?? qrcodeMod).toDataURL(testUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 200,
    });

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});

test.describe("Quick Broadcast Schema Validation", () => {
  test("validates audience and channels for emergency alerts", () => {
    const validPayload = {
      channel: "SMS",
      audienceRole: "GUARDIAN",
      body: "Emergency school dismissal at 1 PM due to weather.",
    };

    const parsed = createBroadcastSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);

    const emptyBody = {
      channel: "SMS",
      audienceRole: "GUARDIAN",
      body: "",
    };
    expect(createBroadcastSchema.safeParse(emptyBody).success).toBe(false);
  });
});

