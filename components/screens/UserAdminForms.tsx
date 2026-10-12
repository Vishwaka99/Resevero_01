"use client";

import { useActionState } from "react";

import { Alert, Button, Field } from "@/components/ui";
import { IDLE } from "@/lib/bff/action-state";
import { inviteUserAction, setActiveAction, setRoleAction } from "@/lib/bff/actions";

export function InviteUserForm({ departmentOptions }: { departmentOptions: Array<{ id: string; label: string }> }) {
  const [state, submit, pending] = useActionState(inviteUserAction, IDLE);

  return (
    <form action={submit} className="rv-stack">
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      {state.status === "error" ? <Alert tone="danger" title={state.message} /> : null}

      <Field label="Name" name="name" required placeholder="Nimal Perera" error={state.errors?.name} />
      <Field label="Work email" name="email" type="email" required placeholder="name@company.lk" error={state.errors?.email} />

      <div className="rv-inline" style={{ alignItems: "flex-start" }}>
        <label className="rv-field" style={{ flex: 1 }}>
          <span className="rv-field-label">Role</span>
          <select className="rv-input" name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="rv-field" style={{ flex: 1 }}>
          <span className="rv-field-label">Team</span>
          <select className="rv-input" name="departmentId" defaultValue="">
            {departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field
        label="Temporary password"
        name="temporaryPassword"
        type="text"
        required
        minLength={8}
        placeholder="At least 8 characters"
        hint="Give it to them in person. Emailed invite links come later."
        error={state.errors?.temporaryPassword}
      />

      <Button type="submit" icon="users" disabled={pending}>
        {pending ? "Adding…" : "Invite user"}
      </Button>
    </form>
  );
}

/** Role and activation live in the row, so a change is one click. */
export function UserRowControls({ userId, role, isActive, isSelf }: { userId: string; role: "admin" | "member"; isActive: boolean; isSelf: boolean }) {
  const [roleState, changeRole, changingRole] = useActionState(setRoleAction, IDLE);
  const [activeState, changeActive, changingActive] = useActionState(setActiveAction, IDLE);
  const message = roleState.status === "error" ? roleState.message : activeState.status === "error" ? activeState.message : null;

  return (
    <div className="rv-stack-sm">
      <div className="rv-inline" style={{ gap: "var(--space-2)" }}>
        <form action={changeRole} className="rv-inline" style={{ gap: "var(--space-2)" }}>
          <input type="hidden" name="userId" value={userId} />
          <label>
            <span className="rv-sr">Role</span>
            <select className="rv-select" name="role" defaultValue={role} disabled={changingRole}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Button type="submit" variant="ghost" size="sm" disabled={changingRole}>
            Save
          </Button>
        </form>

        {isSelf ? null : (
          <form action={changeActive}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
            <Button type="submit" variant="secondary" size="sm" disabled={changingActive}>
              {isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </form>
        )}
      </div>

      {message ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
