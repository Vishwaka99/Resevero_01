"use client";

import { useState } from "react";

import { Icon } from "./Icon";
import { Field, type FieldProps } from "./primitives";

/** A password input with a reveal button, which keeps what was typed when a submission comes back refused. */
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
