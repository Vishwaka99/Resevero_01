/**
 * The session cookie's name, in a module with no Node imports so the proxy
 * (Edge runtime) can read it without pulling in `node:crypto`.
 */
export const SESSION_COOKIE = "reservo_session";
