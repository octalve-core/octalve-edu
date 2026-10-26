import "../support/env";
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { signV4 } from "@/lib/storage";

// signV4 against the worked examples in Amazon's documentation ("Signature Calculations for the Authorization Header", the S3 examples with the key pair
// AKIAIOSFODNN7EXAMPLE, date 20130524T000000Z, region us-east-1). If the signer is wrong by one byte these fail, so a real bucket would refuse every request.

const KEY = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
const DATE = new Date("2013-05-24T00:00:00Z");
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const host = "examplebucket.s3.amazonaws.com";
const base = { host, region: "us-east-1", date: DATE, ...KEY };
const signatureOf = (authorization: string) => authorization.split("Signature=")[1];

test("AWS example: GET Object with a Range header", () => {
  const s = signV4({ ...base, method: "GET", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY });
  expect(s.amzDate).toBe("20130524T000000Z");
  expect(s.signedHeaders).toBe("host;range;x-amz-content-sha256;x-amz-date");
  expect(signatureOf(s.authorization)).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  expect(s.authorization).toContain("Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
});

test("AWS example: PUT Object with a body, a date header and a storage class, in a key that needs encoding", () => {
  const body = "Welcome to Amazon S3.";
  const s = signV4({
    ...base,
    method: "PUT",
    path: "/test%24file.text",
    headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
    payloadHash: crypto.createHash("sha256").update(body).digest("hex"),
  });
  expect(s.signedHeaders).toBe("date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class");
  expect(signatureOf(s.authorization)).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
});

test("AWS example: GET Bucket Lifecycle (a query parameter with no value)", () => {
  const s = signV4({ ...base, method: "GET", path: "/", query: "lifecycle", payloadHash: EMPTY });
  expect(signatureOf(s.authorization)).toBe("fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");
});

test("AWS example: GET Bucket (List Objects) with two query parameters, sent in either order", () => {
  for (const query of ["max-keys=2&prefix=J", "prefix=J&max-keys=2"]) {
    const s = signV4({ ...base, method: "GET", path: "/", query, payloadHash: EMPTY });
    expect(signatureOf(s.authorization), query).toBe("34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
  }
});

test("header names are case-insensitive and values are trimmed and collapsed; every input changes the signature", () => {
  const ref = signV4({ ...base, method: "GET", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY });
  const same = signV4({ ...base, method: "GET", path: "/test.txt", headers: { Range: "  bytes=0-9 " }, payloadHash: EMPTY });
  expect(same.authorization).toBe(ref.authorization);
  const changed = [
    signV4({ ...base, method: "PUT", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY }),
    signV4({ ...base, method: "GET", path: "/test2.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY }),
    signV4({ ...base, method: "GET", path: "/test.txt", headers: { range: "bytes=0-8" }, payloadHash: EMPTY }),
    signV4({ ...base, method: "GET", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY.replace(/^e/, "f") }),
    signV4({
      ...base,
      host: "other.s3.amazonaws.com",
      method: "GET",
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash: EMPTY,
    }),
    signV4({ ...base, region: "eu-west-1", method: "GET", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY }),
    signV4({
      ...base,
      date: new Date("2013-05-24T00:00:01Z"),
      method: "GET",
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash: EMPTY,
    }),
    signV4({
      ...base,
      secretAccessKey: KEY.secretAccessKey + "x",
      method: "GET",
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadHash: EMPTY,
    }),
  ];
  const all = new Set([ref, ...changed].map((s) => signatureOf(s.authorization)));
  expect(all.size).toBe(changed.length + 1);
});
