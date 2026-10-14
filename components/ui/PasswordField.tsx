"use client";

import { useState } from "react";

import { Icon } from "./Icon";
import { Field, type FieldProps } from "./primitives";

/**
 * A password input with a reveal button.
 *
 * Worth having because the alternative is worse than it looks: a password
 * typed blind, confirmed blind, and rejected for not matching leaves someone
 * with no way to see which of the two they got wrong.
 *
 * It flips the input's `type` rather than keeping a shadow copy of the value,
 * so the real characters never live anywhere but the input, and a password
 * manager still sees a password field when it matters. Hidden is the starting
 * state every time — revealing is a deliberate act, and nothing remembers it
 * between fields or between visits.
 */
export function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          className="rv-reveal"
          // A toggle, so the button keeps one name and reports its state,
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
