"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Field } from "@/components/ui";
import { IDLE } from "@/lib/bff/action-state";
import { approveAction, cancelReservationAction, checkInAction, rejectAction } from "@/lib/bff/actions";

/**
 * Small write affordances shared by several screens. Each is a form posting to
 * a server action, so they work without JavaScript and report their result in
 * the same place.
 */

export function CheckInButton({ id, block, size }: { id: string; block?: boolean; size?: "sm" }) {
  const [state, submit, pending] = useActionState(checkInAction, IDLE);

  return (
    <form action={submit} style={{ display: "contents" }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" icon="check" block={block} size={size} disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </Button>
      {state.status === "error" && state.message ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function CancelReservationButton({
  id,
  label = "Cancel reservation",
  size,
  askForReason = true,
}: {
  id: string;
  label?: string;
  size?: "sm";
  askForReason?: boolean;
}) {
  const [state, submit, pending] = useActionState(cancelReservationAction, IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <>
        <Button variant="secondary" size={size} icon="x" onClick={() => setOpen(true)}>
          {label}
        </Button>
        {state.status === "error" && state.message ? (
          <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
            {state.message}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <form action={submit} className="rv-stack" style={{ width: "100%" }}>
      <input type="hidden" name="id" value={id} />
      {askForReason ? <Field label="Reason (optional)" name="reason" placeholder="Meeting moved to a call" maxLength={200} /> : null}
      <div className="rv-inline">
        <Button type="submit" variant="danger" size={size} disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancel"}
        </Button>
        <Button type="button" variant="ghost" size={size} onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
      {state.status === "error" && state.message ? <Alert tone="danger" title={state.message} /> : null}
    </form>
  );
}

/** Approve and reject sit together: rejecting always asks for a reason. */
export function DecisionForm({ id, clashWarning }: { id: string; clashWarning: string | null }) {
  const [approveState, approve, approving] = useActionState(approveAction, IDLE);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, IDLE);
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="rv-stack">
      {clashWarning ? <Alert tone="warning" title="Another request wants the same slot">{clashWarning}</Alert> : null}
      {approveState.status === "error" ? <Alert tone="danger" title={approveState.message} /> : null}

      {showReject ? (
        <form action={reject} className="rv-stack">
          <input type="hidden" name="id" value={id} />
          <Field
            label="Why is it rejected?"
            name="note"
            multiline
            required
            placeholder="The van is booked for the Galle trip that day. Try Thursday, or the Alto."
            error={rejectState.errors?.note ?? (rejectState.status === "error" ? rejectState.message : undefined)}
          />
          <div className="rv-inline">
            <Button type="submit" variant="danger" icon="x" disabled={rejecting}>
              {rejecting ? "Sending…" : "Send rejection"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowReject(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="rv-inline">
          <form action={approve} style={{ display: "contents" }}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" icon="check" disabled={approving}>
              {approving ? "Approving…" : "Approve"}
            </Button>
          </form>
          <Button type="button" variant="secondary" icon="x" onClick={() => setShowReject(true)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
