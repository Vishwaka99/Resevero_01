"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AvailabilityTimeline, Badge, Button, Card, Field, Icon } from "@/components/ui";
import type { TimelineRow } from "@/components/ui";
import { IDLE } from "@/lib/bff/action-state";
import { conflictTitle, offersAlternatives } from "@/lib/bff/conflict-copy";
import { createReservationAction, editReservationAction } from "@/lib/bff/actions";
import type { AvailabilityAnswer, ReservationFormView } from "@/lib/bff/views";

/**
 * Booking, with the conflict check running while the user types.
 *
 * The rule from the design is "prevent conflicts, don't just report them": the
 * form asks the BFF after every change, draws the slot on the timeline, and
 * keeps `Reserve` disabled while a clash stands — offering the nearest free
 * times and similar free resources as one-tap alternatives.
 */
export function ReservationForm({ view }: { view: ReservationFormView }) {
  const isEdit = view.mode === "edit";
  const [state, submit, pending] = useActionState(isEdit ? editReservationAction : createReservationAction, IDLE);

  const [values, setValues] = useState(view.values);
  const [availability, setAvailability] = useState<AvailabilityAnswer>(view.availability);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const resource = useMemo(
    () => view.resourceOptions.find((option) => option.id === values.resourceId) ?? view.resourceOptions[0],
    [values.resourceId, view.resourceOptions],
  );

  const set = <Key extends keyof typeof values>(key: Key, value: (typeof values)[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDismissed(false);
  };

  // Debounced live check. An aborted request never overwrites a newer answer.
  const requestRef = useRef(0);
  useEffect(() => {
    const id = ++requestRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams({
          resourceId: values.resourceId,
          date: values.date,
          from: values.from,
          to: values.to,
          attendees: String(values.attendees || 1),
        });
        if (view.reservationId) params.set("ignore", view.reservationId);

        const response = await fetch(`/api/bff/availability?${params.toString()}`, { signal: controller.signal });
        const body = await response.json();
        if (id === requestRef.current && body.data) setAvailability(body.data as AvailabilityAnswer);
      } catch {
        // An aborted or failed check leaves the last answer in place; the
        // server checks again on submit and has the final say either way.
      } finally {
        if (id === requestRef.current) setChecking(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.resourceId, values.date, values.from, values.to, values.attendees, view.reservationId]);

  const conflict =
    state.conflict ??
    (availability.conflict
      ? {
          reason: availability.conflict.reason,
          message: availability.conflict.message,
          suggestions: availability.suggestions,
          similarFree: availability.similarFree,
        }
      : null);
  const blocked = Boolean(conflict) && !dismissed;

  const timelineRows: TimelineRow[] = view.timeline.rows.map((row) => ({
    ...row,
    blocks: row.blocks.map((block) =>
      block.kind === "draft"
        ? { ...block, title: values.title || "Your booking", start: toDecimal(values.from), end: toDecimal(values.to), conflict: !availability.free }
        : block,
    ),
  }));

  return (
    <div className="rv-grid rv-grid-book">
      <form action={submit} className="rv-stack">
        {isEdit ? <input type="hidden" name="id" value={view.reservationId ?? ""} /> : null}

        <Card title={isEdit ? "Edit reservation" : "Booking details"}>
          <div className="rv-stack">
            {state.status === "success" ? (
              <Alert tone="success" title={state.message}>
                {state.createdCode ? <span className="rv-mono">{state.createdCode}</span> : null}
              </Alert>
            ) : null}
            {state.status === "error" && !state.conflict ? <Alert tone="danger" title={state.message} /> : null}

            <label className="rv-field">
              <span className="rv-field-label">
                Resource<span className="rv-req" aria-hidden="true">*</span>
              </span>
              <select
                className="rv-input"
                name="resourceId"
                value={values.resourceId}
                onChange={(event) => set("resourceId", event.target.value)}
                required
              >
                {view.resourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.needsApproval ? " · needs approval" : ""}
                  </option>
                ))}
              </select>
            </label>

            <Field
              label="Purpose"
              name="title"
              required
              placeholder="Design review"
              maxLength={120}
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              error={state.errors?.title}
              hint="A short line so other people know what the booking is for."
            />

            <div className="rv-inline" style={{ alignItems: "flex-end" }}>
              <Field
                label="Date"
                name="date"
                type="date"
                required
                min={view.minDateISO}
                max={view.maxDateISO}
                value={values.date}
                onChange={(event) => set("date", event.target.value)}
                error={state.errors?.date}
              />
              <Field
                label="From"
                name="from"
                type="time"
                required
                step={(resource?.slotMinutes ?? 30) * 60}
                value={values.from}
                onChange={(event) => set("from", event.target.value)}
                error={state.errors?.from}
              />
              <Field
                label="To"
                name="to"
                type="time"
                required
                step={(resource?.slotMinutes ?? 30) * 60}
                value={values.to}
                onChange={(event) => set("to", event.target.value)}
                error={state.errors?.to}
              />
              <span className="rv-mono" style={{ paddingBottom: 10, color: "var(--ink-muted)" }}>
                {availability.durationLabel}
              </span>
            </div>

            <Field
              label="People"
              name="attendees"
              type="number"
              min={1}
              max={resource?.capacity ?? 1000}
              required
              value={String(values.attendees)}
              onChange={(event) => set("attendees", Number(event.target.value))}
              hint={resource ? `${resource.capacity} is the most this resource takes.` : undefined}
              error={state.errors?.attendees}
            />

        {/* Prevent, don't just report: alternatives are one tap away. */}
            {blocked && conflict ? (
              <Alert
                tone="danger"
                title={conflictTitle(conflict.reason)}
                actions={
                  <>
                    {conflict.suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.date}-${suggestion.from}`}
                        type="button"
                        className="rv-chip"
                        onClick={() => setValues((current) => ({ ...current, date: suggestion.date, from: suggestion.from, to: suggestion.to }))}
                      >
                        <Icon name="clock" size="sm" />
                        {suggestion.label}
                      </button>
                    ))}
                    {conflict.similarFree.map((similar) => (
                      <button
                        key={similar.id}
                        type="button"
                        className="rv-chip"
                        onClick={() => setValues((current) => ({ ...current, resourceId: similar.id }))}
                      >
                        <Icon name="arrow-right" size="sm" />
                        {similar.name}
                      </button>
                    ))}
                    {/*
                      Only worth saying when the slot really was taken. A
                      booking refused for being too long, or for too many
                      people, is not fixed by another day — the sentence above
                      already says what to change.
                    */}
                    {offersAlternatives(conflict.reason) && !conflict.suggestions.length && !conflict.similarFree.length ? (
                      <span className="rv-muted" style={{ fontSize: 13 }}>
                        Nothing similar is free then. Try another day.
                      </span>
                    ) : null}
                  </>
                }
              >
                {conflict.message}
              </Alert>
            ) : null}

            {!blocked && availability.free && availability.competing ? (
              <Alert tone="warning" title="Someone else has asked for this time too">
                {availability.competing}
              </Alert>
            ) : null}

            {!blocked && availability.free && !availability.competing ? (
              <Alert tone="success" title="The slot is free">
                {availability.needsApproval
                  ? "An admin decides this one. The slot is held while they look at it."
                  : "Nothing else is booked here. An admin still has to approve it."}
              </Alert>
            ) : null}

            {!isEdit ? (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="rv-field-label" style={{ padding: 0 }}>
                  Repeat
                </legend>
                <div className="rv-inline" style={{ marginTop: 6 }}>
                  <div className="rv-segmented">
                    {[
                      { id: "none", label: "Does not repeat" },
                      { id: "weekly", label: "Weekly" },
                      { id: "weekdays", label: "Every weekday" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={values.repeat === option.id}
                        onClick={() => set("repeat", option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="repeat" value={values.repeat} />
                  {values.repeat !== "none" ? (
                    <Field
                      label="Until"
                      name="repeatUntil"
                      type="date"
                      min={values.date}
                      value={values.repeatUntil}
                      onChange={(event) => set("repeatUntil", event.target.value)}
                      error={state.errors?.repeatUntil}
                    />
                  ) : null}
                </div>
                {values.repeat !== "none" ? (
                  <p className="rv-field-hint" style={{ marginTop: 6 }}>
                    Dates where the slot is already taken are skipped, and we tell you which.
                  </p>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        </Card>

        <div className="rv-inline">
          <Button type="submit" icon="calendar-plus" disabled={pending || blocked || checking}>
            {pending ? "Saving…" : isEdit ? "Save changes" : availability.needsApproval ? "Send request" : "Reserve"}
          </Button>
          <a href={view.backHref} className="rv-btn rv-btn-secondary" style={{ textDecoration: "none" }}>
            Cancel
          </a>
          {checking ? (
            <span className="rv-muted" style={{ fontSize: 13 }}>
              Checking availability…
            </span>
          ) : null}
          {blocked ? (
            <button type="button" className="rv-link" onClick={() => setDismissed(true)}>
              Let me submit anyway
            </button>
          ) : null}
        </div>
        {blocked ? (
          <p className="rv-field-hint">
            The server checks again when you submit, so a booking that clashes is refused there too.
          </p>
        ) : null}
      </form>

      <aside className="rv-stack">
        <Card title="Live availability" meta={view.timeline.dateLabel}>
          <AvailabilityTimeline
            rows={timelineRows}
            startHour={view.timeline.startHour}
            endHour={view.timeline.endHour}
            now={view.timeline.now}
            hourWidth={52}
            legend={false}
          />
        </Card>

        <Card title="Summary">
          <dl className="rv-dl">
            <dt>Resource</dt>
            <dd>{availability.summary.resourceName}</dd>
            <dt>When</dt>
            <dd className="rv-mono">{availability.summary.whenLabel}</dd>
            <dt>Length</dt>
            <dd className="rv-mono">{availability.durationLabel}</dd>
            <dt>Approval</dt>
            <dd>{availability.summary.approvalLabel}</dd>
            <dt>Status</dt>
            <dd>
              <Badge status={availability.free ? "available" : "conflict"}>{availability.free ? "Slot is free" : "Clash"}</Badge>
            </dd>
          </dl>
        </Card>
      </aside>
    </div>
  );
}

function toDecimal(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return (hour || 0) + (minute || 0) / 60;
}
