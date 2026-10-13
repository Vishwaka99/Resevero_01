import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appUrl, approvalsAddress, sendMail } from "@/lib/server/mail";

/**
 * The point of these is that sending must never be able to break the thing
 * that triggered it. Registering an account and approving one both send mail,
 * and neither may fail because a provider is missing or refusing.
 */

const KEYS = ["RESEND_API_KEY", "APPROVALS_EMAIL", "APP_URL", "MAIL_FROM"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("sendMail", () => {
  it("does nothing, and says so, when no API key is configured", async () => {
    const result = await sendMail({ to: "someone@example.com", subject: "Hi", text: "Body" });
    expect(result).toEqual({ sent: false, reason: "not-configured" });
  });

  it("reports a refusal instead of throwing", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));

    const result = await sendMail({ to: "someone@example.com", subject: "Hi", text: "Body" });
    expect(result).toEqual({ sent: false, reason: "http-403" });
  });

  it("reports an unreachable provider instead of throwing", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    }));

    const result = await sendMail({ to: "someone@example.com", subject: "Hi", text: "Body" });
    expect(result).toEqual({ sent: false, reason: "unreachable" });
  });

  it("posts the message to Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Reservo <noreply@example.com>";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMail({ to: "someone@example.com", subject: "Hi", text: "Body" });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Reservo <noreply@example.com>",
      to: ["someone@example.com"],
      subject: "Hi",
      text: "Body",
    });
  });
});

describe("configuration", () => {
  it("has no approvals address unless one is set", () => {
    expect(approvalsAddress()).toBeNull();
    process.env.APPROVALS_EMAIL = "  approvals@example.com  ";
    expect(approvalsAddress()).toBe("approvals@example.com");
  });

  it("falls back to localhost and never leaves a trailing slash", () => {
    expect(appUrl()).toBe("http://localhost:3000");
    process.env.APP_URL = "https://reservo.example.com///";
    expect(appUrl()).toBe("https://reservo.example.com");
  });
});
