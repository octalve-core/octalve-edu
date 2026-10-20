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
function chunkedPost(chunkBytes: number, chunks: number, finish: boolean, waitMs: number): Promise<{ status: number | null; ms: number }> {
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
        `POST ${path()} HTTP/1.1`,
        `Host: localhost:${SAAS_PORT}`,
        `Origin: ${SAAS_URL}`,
        `Cookie: ${cookie}`,
        `x-real-ip: ${uniqueIp()}`,
        "Content-Type: application/json",
        "Transfer-Encoding: chunked",
        "",
        "",
      ].join("\r\n");
      socket.write(headers);
      const first = `{"title":"`;
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

test("the server is still answering afterwards", async () => {
  const res = await api(path(), { method: "POST", baseUrl: SAAS_URL, cookie, body: { title: "" } });
  expect(res.status).toBe(400);
});
