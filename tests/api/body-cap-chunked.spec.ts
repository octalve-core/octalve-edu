import "../support/env";
import net from "node:net";
import { test, expect } from "@playwright/test";
import { SAAS_PORT, SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { uniqueIp } from "../support/db";

// The 1 MiB cap on a request body, over real HTTP. A body with a Content-Length is refused from the header; a CHUNKED body (no length to look at) can only be measured by
// reading it, so it is read no further than the cap: a chunked body that passes the cap gets its 413 straight away, even when the sender never finishes it.
// The route is one behind validate(): creating an assignment.

let a: TestTenant;
let cookie: string;
const MIB = 1024 * 1024;
const path = () => `/api/v1/schools/${a.code}/lms/assignments`;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Body Cap School" });
  const admin = await createUser({ name: "Ada Admin" });
  await addMembership(admin.id, a.id, Role.ADMIN);
  const login = await loginAs(admin, { baseUrl: SAAS_URL });
  expect(login.status).toBe(200);
  cookie = cookieHeader(login.token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

/// A chunked POST written straight to the socket: the first chunk starts a JSON string, then `chunks` chunks of `chunkBytes`; the body is only ended when `finish` is true.
/// Resolves with the response's status line code, or null when none arrived within `waitMs`.
function chunkedPost(
  chunkBytes: number,
  chunks: number,
  finish: boolean,
  waitMs: number,
  target: { route: string; first: string; signedIn: boolean } = { route: path(), first: `{"title":"`, signedIn: true },
): Promise<{ status: number | null; ms: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect(SAAS_PORT, "127.0.0.1");
    let received = "";
    let settled = false;
    const settle = (status: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ status, ms: Date.now() - started });
    };
    const timer = setTimeout(() => settle(null), waitMs);
    socket.on("data", (data) => {
      received += data.toString("latin1");
      const line = /^HTTP\/1\.1 (\d{3})/.exec(received);
      if (line) settle(Number(line[1]));
    });
    socket.on("error", () => settle(/^HTTP\/1\.1 (\d{3})/.exec(received) ? Number(/^HTTP\/1\.1 (\d{3})/.exec(received)![1]) : null));
    socket.on("connect", () => {
      const headers = [
        `POST ${target.route} HTTP/1.1`,
        `Host: localhost:${SAAS_PORT}`,
        `Origin: ${SAAS_URL}`,
        ...(target.signedIn ? [`Cookie: ${cookie}`] : []),
        `x-real-ip: ${uniqueIp()}`,
        "Content-Type: application/json",
        "Transfer-Encoding: chunked",
        "",
        "",
      ].join("\r\n");
      socket.write(headers);
      const first = target.first;
      socket.write(`${first.length.toString(16)}\r\n${first}\r\n`);
      const piece = "x".repeat(chunkBytes);
      for (let i = 0; i < chunks; i++) socket.write(`${chunkBytes.toString(16)}\r\n${piece}\r\n`);
      if (finish) socket.write(`2\r\n"}\r\n0\r\n\r\n`);
    });
  });
}

test("the control: a small body reaches validate() and is judged on its fields", async () => {
  const res = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, body: { title: "" } });
  expect(res.status).toBe(400);
  expect(res.json.error.code).toBe("VALIDATION");
});

test("a declared length over the cap is a 413", async () => {
  const res = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, rawBody: JSON.stringify({ title: "x".repeat(MIB + 10) }) });
  expect(res.status).toBe(413);
  expect(res.json.error.code).toBe("PAYLOAD_TOO_LARGE");
});

test("a chunked body that is finished and over the cap is a 413", async () => {
  const sent = await chunkedPost(64 * 1024, 20, true, 20_000); // 1.25 MiB
  expect(sent.status).toBe(413);
});

test("a chunked body that passes the cap and then stalls still gets its 413, without waiting for the end of it", async () => {
  const sent = await chunkedPost(64 * 1024, 20, false, 20_000); // 1.25 MiB, never ended
  expect(sent.status, "no answer within 20 s: the server is waiting for the end of the body").toBe(413);
  expect(sent.ms).toBeLessThan(10_000);
});

// The routes that read their own body (readJsonBody) are bounded the same way: the sign-in route, which anybody can reach, and a route behind a session.
test("sign-in: a chunked body that passes the cap and then stalls still gets its 413, without waiting for the end of it", async () => {
  const sent = await chunkedPost(64 * 1024, 20, false, 20_000, { route: "/api/v1/auth/login", first: `{"email":"`, signedIn: false });
  expect(sent.status, "no answer within 20 s: the server is waiting for the end of the body").toBe(413);
  expect(sent.ms).toBeLessThan(10_000);
});

test("a route behind a session that reads its own body (change of password): the same", async () => {
  const sent = await chunkedPost(64 * 1024, 20, false, 20_000, {
    route: "/api/v1/auth/change-password",
    first: `{"currentPassword":"`,
    signedIn: true,
  });
  expect(sent.status, "no answer within 20 s: the server is waiting for the end of the body").toBe(413);
  expect(sent.ms).toBeLessThan(10_000);
});

test("the payment webhook (raw text, its own cap of 256 KiB): a chunked body past the cap that never ends gets its 413", async () => {
  const sent = await chunkedPost(64 * 1024, 5, false, 20_000, { route: "/api/v1/webhooks/paystack", first: `{"event":"`, signedIn: false });
  expect(sent.status, "no answer within 20 s: the server is waiting for the end of the body").toBe(413);
  expect(sent.ms).toBeLessThan(10_000);
});

const oversize = (bytes: number) => JSON.stringify({ title: "x".repeat(bytes) });

/// The same kind of body as a chunked upload with no length (a streamed request body), through the client every test here uses.
const streamedOversize = (bytes: number) =>
  fetch(`${SAAS_URL}${path()}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SAAS_URL, "x-real-ip": uniqueIp(), cookie },
    body: new ReadableStream({
      start(controller) {
        const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
        controller.enqueue(new TextEncoder().encode('{"title":"'));
        for (let sent = 0; sent < bytes; sent += chunk.length) controller.enqueue(chunk);
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    }),
    // @ts-expect-error `duplex` is required by Node for a streamed request body and is not in the DOM typings
    duplex: "half",
  });

test("a refusal for size closes the connection, so the client cannot reuse one that is about to be torn down", async () => {
  const declared = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, rawBody: oversize(3 * MIB) });
  expect(declared.status).toBe(413);
  expect(declared.headers.get("connection"), "a body refused unread").toBe("close");
  const streamed = await streamedOversize(2 * MIB);
  expect(streamed.status).toBe(413);
  expect(streamed.headers.get("connection"), "a chunked body refused at the cap").toBe("close");
});

test("the request after a refused oversize body is answered, never reset (repeated: it is a timing fault, not a constant one)", async () => {
  for (let round = 1; round <= 8; round++) {
    const declared = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, rawBody: oversize(3 * MIB) });
    expect(declared.status, `round ${round}: declared`).toBe(413);
    const streamed = await streamedOversize(2 * MIB);
    expect(streamed.status, `round ${round}: chunked`).toBe(413);
    const next = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, body: { title: "" } });
    expect(next.status, `round ${round}: the request after the refusals`).toBe(400);
  }
});

test("the server is still answering afterwards", async () => {
  const res = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, body: { title: "" } });
  expect(res.status).toBe(400);
});
