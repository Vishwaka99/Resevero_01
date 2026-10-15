import { describe, expect, it } from "vitest";

import { fieldErrors, signUpInput } from "@/lib/bff/schemas";

/**
 * The registration form's rules, pinned.
 *
 * The match check earns its own tests because it failed in a way that looked
 * like a bug in the comparison and was not: a refused submission used to
 * empty both password fields while leaving the rest filled, and a masked
 * empty field is indistinguishable from a full one, so the next attempt came
 * back "those passwords don't match" with nothing visibly wrong. The
 * comparison was always right. These say so, and the form keeps its values
 * now so the situation cannot arise.
 */
const valid = {
  name: "Nimal Perera",
  email: "nimal@company.lk",
  password: "abcd12345",
  confirmPassword: "abcd12345",
};

const errorsFor = (input: Record<string, unknown>) => {
  const result = signUpInput.safeParse(input);
  return result.success ? {} : fieldErrors(result.error);
};

describe("signUpInput", () => {
  it("accepts a well-formed registration", () => {
    const result = signUpInput.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts passwords that match exactly, including punctuation and spaces", () => {
    for (const password of ["abcd12345", "a b c d 1 2", "Pä$$w0rd—long", "x".repeat(72)]) {
      const result = signUpInput.safeParse({ ...valid, password, confirmPassword: password });
      expect(result.success, `should accept ${JSON.stringify(password)}`).toBe(true);
    }
  });

  it("reports a mismatch on the confirm field, not the password field", () => {
    const errors = errorsFor({ ...valid, confirmPassword: "abcd12346" });
    expect(errors.confirmPassword).toBe("Those passwords don't match.");
    expect(errors.password).toBeUndefined();
  });

  it("treats a trailing space as a different password, because it is one", () => {
    const errors = errorsFor({ ...valid, confirmPassword: "abcd12345 " });
    expect(errors.confirmPassword).toBe("Those passwords don't match.");
  });

  it("refuses an empty confirmation rather than silently matching", () => {
    const errors = errorsFor({ ...valid, confirmPassword: "" });
    expect(errors.confirmPassword).toBeDefined();
  });

  it("holds the password to 8–72 characters and refuses whitespace alone", () => {
    expect(errorsFor({ ...valid, password: "abcd123", confirmPassword: "abcd123" }).password)
      .toBe("Use at least 8 characters.");
    expect(errorsFor({ ...valid, password: "x".repeat(73), confirmPassword: "x".repeat(73) }).password)
      .toBe("Use 72 characters or fewer.");
    expect(errorsFor({ ...valid, password: "         ", confirmPassword: "         " }).password)
      .toBe("A password cannot be only spaces.");
  });

  it("checks the name and the address too", () => {
    expect(errorsFor({ ...valid, name: "A" }).name).toBe("Enter your name.");
    expect(errorsFor({ ...valid, name: "<script>" }).name).toBe("Remove any < > { } from your name.");
    expect(errorsFor({ ...valid, email: "not-an-address" }).email).toBe("That doesn't look like an email address.");
  });

  it("trims the name and the address but never the password", () => {
    const parsed = signUpInput.safeParse({ ...valid, name: "  Nimal Perera  ", email: "  nimal@company.lk  " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.name).toBe("Nimal Perera");
    expect(parsed.data.email).toBe("nimal@company.lk");
    expect(parsed.data.password).toBe("abcd12345");
  });
});
