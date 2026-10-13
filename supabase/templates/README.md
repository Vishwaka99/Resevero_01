# Auth email templates

Supabase sends the authentication mail — confirmation, invite, recovery — from
templates stored in the project, not in this repository. These files are the
source of truth for what *should* be there; applying them is a copy and paste.

## Applying

**Authentication → Emails** in the Supabase dashboard, then for each file:

| File | Template |
| --- | --- |
| `confirm-signup.html` | Confirm signup |
| `invite-user.html` | Invite user |

Paste the body in and save. The HTML comment at the top of each file explains
what it changes and why; it is harmless to leave in.

## Why not the stock templates

Two reasons, and the first one is not cosmetic.

**The link shape matters.** The stock templates use `{{ .ConfirmationURL }}`,
which points at Supabase's verify endpoint and redirects back with a PKCE
`code`. These link straight to `/auth/confirm` with a `token_hash` instead,
which is the form Supabase recommends for server-rendered apps: one less
redirect, and a link that a corporate mail scanner cannot spend on the
recipient's behalf just by following it.

`app/auth/confirm/route.ts` accepts both, so an unedited project still works —
but the direct form is the better one.

**The stock confirmation email is misleading here.** It implies that confirming
is the last step. In this app a self-registration then waits for an admin, so
someone who confirms and immediately tries to sign in is told their account is
not active and reasonably concludes something is broken. The template says so
up front instead.

## Before they will arrive at all

- **Authentication → URL Configuration → Site URL** has to be the app's origin,
  because `{{ .SiteURL }}` builds the link out of it.
- Add `<origin>/auth/confirm` to **Redirect URLs** on the same page.
- **Project Settings → Authentication → SMTP** needs a real provider. Supabase's
  built-in sender only delivers to members of your organisation, at a couple of
  messages an hour, which looks exactly like nothing happening.

These are separate from `RESEND_API_KEY`, which the application uses for its
own mail — the approval handshake — and not for any of the above.
