/**
 * The two notes the approval handshake sends.
 *
 * Both are best-effort: `sendMail` never throws, and neither of these is
 * awaited for its result by anything that matters. Registering an account must
 * not fail because a mail provider is unhappy, and neither must approving one.
 */

import { appUrl, approvalsAddress, sendMail } from "./mail";

/**
 * Tells whoever handles approvals that somebody is waiting.
 *
 * Without this, a self-registration is silent: the profile sits inactive and
 * nobody has any reason to look at the Users screen. Unset APPROVALS_EMAIL and
 * it simply does nothing, which is the right behaviour for a deployment that
 * would rather watch the screen itself.
 */
export async function notifyApprovalQueue(user: { name: string; email: string }): Promise<void> {
  const to = approvalsAddress();
  if (!to) return;

  await sendMail({
    to,
    subject: `Reservo: ${user.name} is waiting for approval`,
    text: [
      `${user.name} (${user.email}) has registered and is waiting to be let in.`,
      "",
      "They cannot sign in until an admin activates the account:",
      `${appUrl()}/admin/users`,
      "",
      "If you do not recognise this person, leave the account inactive. An",
      "account nobody activates can do nothing at all.",
    ].join("\n"),
  });
}

/**
 * Tells someone their account is open.
 *
 * Approval was otherwise invisible: the account quietly started working, and
 * the only way to discover that was to keep trying to sign in.
 */
export async function notifyAccountApproved(user: { name: string; email: string }): Promise<void> {
  await sendMail({
    to: user.email,
    subject: "Reservo: your account is ready",
    text: [
      `Hello ${user.name},`,
      "",
      "An admin has approved your Reservo account, so you can sign in now:",
      `${appUrl()}/sign-in`,
      "",
      "Use the email address this was sent to, and the password you chose when",
      "you registered.",
    ].join("\n"),
  });
}
