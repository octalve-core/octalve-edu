import "../support/env";
import { test, expect } from "@playwright/test";
import { DEFAULT_VIDEO_GUIDE_BASE, videoGuideMedia } from "@/lib/video-guide/media-base";
import { distDirFrom } from "@/lib/build/dist-dir";
import { buildCsp } from "@/lib/security/csp";

// Task 0041, slice F7. Where the video guide's files come from is a deployment setting that ends up in a page and in its Content-Security-Policy, so the rule is strict: a path on this site
// or an https address, nothing else; anything else is the default. The build folder setting has the same shape of rule.

const DEFAULT = { base: DEFAULT_VIDEO_GUIDE_BASE, origin: null };

test.describe("videoGuideMedia", () => {
  test("nothing set is the folder on this site", () => {
    for (const value of [undefined, null, "", "   "]) expect(videoGuideMedia(value)).toEqual(DEFAULT);
  });

  test("a path on this site is kept, without a trailing slash", () => {
    expect(videoGuideMedia("/files/guide")).toEqual({ base: "/files/guide", origin: null });
    expect(videoGuideMedia("/files/guide///")).toEqual({ base: "/files/guide", origin: null });
    expect(videoGuideMedia(" /files/guide ")).toEqual({ base: "/files/guide", origin: null });
  });

  test("an https address on another host gives its origin, for the page's policy", () => {
    expect(videoGuideMedia("https://media.example.org/guide")).toEqual({
      base: "https://media.example.org/guide",
      origin: "https://media.example.org",
    });
    expect(videoGuideMedia("https://media.example.org/guide/")).toEqual({
      base: "https://media.example.org/guide",
      origin: "https://media.example.org",
    });
    expect(videoGuideMedia("https://media.example.org")).toEqual({
      base: "https://media.example.org",
      origin: "https://media.example.org",
    });
    expect(videoGuideMedia("https://media.example.org:8443/x")).toEqual({
      base: "https://media.example.org:8443/x",
      origin: "https://media.example.org:8443",
    });
  });

  test("anything that could widen the policy or change what an address means is the default", () => {
    const refused = [
      "http://media.example.org/guide", // not secure
      "//media.example.org/guide", // another host in disguise
      "ftp://media.example.org/guide",
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "https://user:pass@media.example.org/guide", // sign-in details
      "https://media.example.org/guide?token=1", // a query
      "https://media.example.org/guide#x", // a fragment
      "/files/../etc",
      "/files/guide?x=1",
      "/files/gu ide",
      "/files\\guide",
      "media.example.org/guide", // no scheme and no slash
      "not a url",
      "/",
      "///",
    ];
    for (const value of refused) expect(videoGuideMedia(value), value).toEqual(DEFAULT);
  });
});

test.describe("the page policy allows the other host on its own page only", () => {
  const nonce = "AAAAAAAAAAAAAAAAAAAAAA==";
  const directive = (policy: string, name: string) => policy.split("; ").find((d) => d === name || d.startsWith(`${name} `));

  test("without a media origin the policy has no media-src and connect-src stays 'self'", () => {
    const policy = buildCsp({ nonce });
    expect(directive(policy, "media-src")).toBeUndefined();
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
  });

  test("with one, media-src and connect-src name exactly that origin and nothing else changes", () => {
    const policy = buildCsp({ nonce, mediaOrigin: "https://media.example.org" });
    expect(directive(policy, "media-src")).toBe("media-src 'self' https://media.example.org");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://media.example.org");
    expect(directive(policy, "script-src")).toBe(directive(buildCsp({ nonce }), "script-src"));
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
  });
});

test.describe("distDirFrom", () => {
  test("unset or empty leaves Next's default folder", () => {
    for (const value of [undefined, "", "  "]) expect(distDirFrom(value)).toBeUndefined();
  });

  test("a plain folder name is used", () => {
    expect(distDirFrom(".next-walk")).toBe(".next-walk");
    expect(distDirFrom(" build_2 ")).toBe("build_2");
  });

  test("a path, a parent folder or an odd name stops the build with a sentence", () => {
    for (const value of ["../out", "/tmp/build", "a/b", "..", ".", "build dir", ".next;rm", "~/x", "a\\b"])
      expect(() => distDirFrom(value), value).toThrow(/NEXT_DIST_DIR must be a plain folder name/);
  });
});
