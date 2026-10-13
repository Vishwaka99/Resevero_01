/**
 * Outbound email, over Resend's HTTP API.
 *
 * One POST and a bearer token, so there is no SDK and no SMTP client here —
 * which also keeps this usable from any runtime that has `fetch`.
 *
 * Note what this is *not* for: Supabase sends the auth mail (confirmation,
 * invite, password recovery) from its own templates. This is only for the
 * messages the application itself has an opinion about, which today means the
 * two halves of the approval handshake.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type Mail = {
  to: string;
  subject: string;
  /** Plain text only. These are short operational notes, not marketing. */
  text: string;
};

function settings() {
  return {
    apiKey: process.env.RESEND_API_KEY,
    // Resend will only accept a `from` on a domain you have verified, with the
    // exception of its own onboarding@resend.dev.
    from: process.env.MAIL_FROM ?? "Reservo <onboarding@resend.dev>",
  };
}

/**
 * Sends a message, and never throws.
 *
 * Every caller is doing something more important than the email — registering
 * an account, approving one — and none of them should fail because a mail
 * provider is down, rate-limiting, or simply not configured. A failure is
 * logged and swallowed, and the return value says what happened for anyone who
 * wants to care.
 *
 * With no RESEND_API_KEY the message is written to the server log instead.
 * That keeps development and CI working with no account, and still lets you
 * read what would have been sent.
 */
export async function sendMail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const { apiKey, from } = settings();

  if (!apiKey) {
    console.info(`[mail] RESEND_API_KEY not set; not sending.\n  to: ${mail.to}\n  subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, "\n  ")}`);
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });

    if (!response.ok) {
      // Resend explains refusals properly — an unverified sending domain, a
      // recipient the free tier will not accept — and those are worth seeing.
      const detail = await response.text().catch(() => "");
      console.error(`[mail] Resend refused ${response.status} for ${mail.to}: ${detail.slice(0, 400)}`);
      return { sent: false, reason: `http-${response.status}` };
    }

    return { sent: true };
  } catch (error) {
    console.error(`[mail] Could not reach Resend for ${mail.to}:`, error instanceof Error ? error.message : error);
    return { sent: false, reason: "unreachable" };
  }
}

/**
 * The app's public origin, for links inside emails.
 *
 * A fixed setting rather than the requesting host: a link in an inbox is
 * followed later, from somewhere else, so it has to be the canonical address
 * rather than whatever host happened to serve the request that sent it. (The
 * Supabase confirmation redirect is the opposite case and does use the live
 * host, because it has to match what the browser is on.)
 */
export function appUrl(): string {
  return (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** Where registrations are sent for approval, if anywhere. */
export function approvalsAddress(): string | null {
  return process.env.APPROVALS_EMAIL?.trim() || null;
}
