"use client";

import { useActionState } from "react";

import { Alert, Button, Checkbox, Field } from "@/components/ui";
import { IDLE } from "@/lib/bff/action-state";
import { blockTimeAction, retireResourceAction, upsertResourceAction } from "@/lib/bff/actions";
import type { ManageResourcesView } from "@/lib/bff/views";

/** Add or edit a resource, with its booking rules. */
export function ResourceForm({ view }: { view: ManageResourcesView }) {
  const [state, submit, pending] = useActionState(upsertResourceAction, IDLE);
  const [retireState, retire, retiring] = useActionState(retireResourceAction, IDLE);
  const form = view.form;

  return (
    <div className="rv-stack">
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      {state.status === "error" ? <Alert tone="danger" title={state.message} /> : null}

      <form action={submit} className="rv-stack" key={form.id ?? "new"}>
        {form.id ? <input type="hidden" name="id" value={form.id} /> : null}

        <Field label="Name" name="name" required defaultValue={form.name} placeholder="Board Room A" error={state.errors?.name} />

        <div className="rv-inline" style={{ alignItems: "flex-start" }}>
          <label className="rv-field" style={{ flex: 1 }}>
            <span className="rv-field-label">Type</span>
            <select className="rv-input" name="typeId" defaultValue={form.typeId}>
              {view.typeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rv-field" style={{ flex: 1 }}>
            <span className="rv-field-label">Location</span>
            <select className="rv-input" name="locationId" defaultValue={form.locationId}>
              {view.locationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Field label="Description" name="description" multiline defaultValue={form.description} maxLength={600} error={state.errors?.description} />

        <div className="rv-inline" style={{ alignItems: "flex-start" }}>
          <Field label="Capacity" name="capacity" type="number" min={1} required defaultValue={String(form.capacity)} error={state.errors?.capacity} />
          <Field label="Slot length (min)" name="slotMinutes" type="number" min={15} step={15} required defaultValue={String(form.slotMinutes)} error={state.errors?.slotMinutes} />
          <Field label="Longest booking (min)" name="maxMinutes" type="number" min={15} step={15} required defaultValue={String(form.maxMinutes)} error={state.errors?.maxMinutes} />
          <Field label="Book ahead (days)" name="bookAheadDays" type="number" min={1} required defaultValue={String(form.bookAheadDays)} error={state.errors?.bookAheadDays} />
        </div>

        <div className="rv-inline" style={{ alignItems: "flex-start" }}>
          <Field label="Opens" name="openFrom" type="time" required defaultValue={form.openFrom} error={state.errors?.openFrom} />
          <Field label="Closes" name="openTo" type="time" required defaultValue={form.openTo} error={state.errors?.openTo} />
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rv-field-label" style={{ padding: 0 }}>
            Bookable days
          </legend>
          <div className="rv-inline" style={{ marginTop: 6 }}>
            {view.dayOptions.map((day) => (
              <Checkbox key={day.value} label={day.label} name="openDays" value={String(day.value)} defaultChecked={form.openDays.includes(day.value)} />
            ))}
          </div>
          {state.errors?.openDays ? (
            <span className="rv-field-hint" style={{ color: "var(--danger)" }}>
              {state.errors.openDays}
            </span>
          ) : null}
        </fieldset>

        <div className="rv-inline">
          <Checkbox label="Needs an admin's approval" name="requiresApproval" defaultChecked={form.requiresApproval} />
          <Checkbox label="Needs check-in, or the slot is released" name="requiresCheckIn" defaultChecked={form.requiresCheckIn} />
        </div>

        <Field
          label="Features"
          name="amenities"
          defaultValue={form.amenities}
          placeholder="Screen, Whiteboard, Wheelchair access"
          hint="Separated by commas. People filter by these."
        />

        <div className="rv-inline" style={{ alignItems: "flex-start" }}>
          <label className="rv-field" style={{ flex: 1 }}>
            <span className="rv-field-label">Managed by</span>
            <select className="rv-input" name="managedBy" defaultValue={form.managedBy}>
              {view.managerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rv-field" style={{ flex: 1 }}>
            <span className="rv-field-label">Status</span>
            <select className="rv-input" name="status" defaultValue={form.status}>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </label>
        </div>

        <p className="rv-field-hint">
          Changing the hours or capacity never cancels existing bookings. Any that no longer fit are listed so you can decide.
        </p>

        <div className="rv-inline">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : view.isEditing ? "Save changes" : "Add resource"}
          </Button>
          {view.isEditing ? (
            <a href="/admin/resources" className="rv-btn rv-btn-secondary" style={{ textDecoration: "none" }}>
              Cancel
            </a>
          ) : null}
        </div>
      </form>

      {view.isEditing && form.id ? (
        <form action={retire} className="rv-inline">
          <input type="hidden" name="id" value={form.id} />
          <Button type="submit" variant="ghost" size="sm" icon="tag" disabled={retiring}>
            {retiring ? "Retiring…" : "Retire resource"}
          </Button>
          {retireState.message ? (
            <span style={{ fontSize: 12, color: retireState.status === "error" ? "var(--danger)" : "var(--ink-muted)" }}>{retireState.message}</span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** Block a maintenance window. Bookings inside it are cancelled and explained. */
export function BlockTimeForm({ view }: { view: ManageResourcesView }) {
  const [state, submit, pending] = useActionState(blockTimeAction, IDLE);

  return (
    <form action={submit} className="rv-stack">
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      {state.status === "error" ? <Alert tone="danger" title={state.message} /> : null}

      <label className="rv-field">
        <span className="rv-field-label">Resource</span>
        <select className="rv-input" name="resourceId" defaultValue={view.blockDefaults.resourceId}>
          {view.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>

      <div className="rv-inline" style={{ alignItems: "flex-start" }}>
        <Field label="Date" name="date" type="date" required defaultValue={view.blockDefaults.date} error={state.errors?.date} />
        <Field label="From" name="from" type="time" required defaultValue={view.blockDefaults.from} error={state.errors?.from} />
        <Field label="To" name="to" type="time" required defaultValue={view.blockDefaults.to} error={state.errors?.to} />
      </div>

      <Field label="Reason" name="reason" required placeholder="Lamp replacement" maxLength={120} error={state.errors?.reason} />

      <Alert tone="warning" title="Bookings in that window are cancelled">
        People who had booked the resource are told why, so nobody turns up to a closed room.
      </Alert>

      <Button type="submit" icon="wrench" disabled={pending}>
        {pending ? "Blocking…" : "Block this time"}
      </Button>
    </form>
  );
}
