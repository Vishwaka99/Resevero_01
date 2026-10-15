"use client";

import { useState } from "react";

import { Icon } from "./Icon";
import { Field, type FieldProps } from "./primitives";

/**
 * A password input with a reveal button, which keeps what was typed when a
 * submission comes back refused.
 *
 * Both of those exist for the same reason. A password typed blind, confirmed
 * blind and rejected for not matching leaves someone with no way to see which
 * of the two they got wrong — and React resets an uncontrolled form after a
 * server action, so every refusal silently emptied both fields while the name
 * and email beside them stayed put. Masked and empty looks exactly like
 * masked and full, so the next attempt would fail on "those passwords don't
 * match" with no visible cause. Holding the value here survives that reset.
 *
 * The value lives in component state rather than the DOM, which is no
 * different in reach — it was always in memory — and it is never sent
 * anywhere but the form it belongs to.
 *
 * Revealing flips the input's `type` rather than keeping a second copy, so a
 * password manager still sees a password field when it matters. Hidden is the
 * starting state every time; nothing remembers it between fields or visits.
 */
export function PasswordField(props: Omit<FieldProps, "type" | "trailing" | "value" | "onChange">) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const label = visible ? "Hide password" : "Show password";

  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      trailing={
        <button
          type="button"
          className="rv-reveal"
          // A toggle, so the button keeps one name and reports its state
          // rather than renaming itself and making a screen reader re-read it.
          aria-pressed={visible}
          aria-label={label}
          title={label}
          onClick={() => setVisible((shown) => !shown)}
        >
          <Icon name={visible ? "eye-off" : "eye"} />
        </button>
      }
    />
  );
}
