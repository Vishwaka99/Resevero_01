import { Icon } from "./Icon";

export type TimelineBlockKind = "busy" | "mine" | "pending" | "blocked" | "draft";

export type TimelineBlock = {
  /** Decimal hours, e.g. 9.5 for 09:30. The BFF shapes them this way. */
  start: number;
  end: number;
  title: string;
  kind?: TimelineBlockKind;
  conflict?: boolean;
  href?: string;
};

export type TimelineRow = {
  id: string;
  name: string;
  meta?: string;
  href?: string;
  blocks: TimelineBlock[];
  /** Bookable window in decimal hours. Hours outside it are shaded as closed. */
  openFrom?: number;
  openTo?: number;
  /** True when the resource cannot be booked on this day at all. */
  closedAllDay?: boolean;
};

export function formatHour(decimal: number) {
  const hh = Math.floor(decimal);
  const mm = Math.round((decimal - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const LEGEND: Array<[string, string]> = [
  ["Free", "surface-sunken"],
  ["Booked", "slot-busy"],
  ["Yours", "primary"],
  ["Pending", "warning-soft"],
  ["Maintenance", "slot-blocked"],
];

/**
 * Resource rows × hour columns. Availability is drawn, not listed: free lanes
 * are sunken, other people's bookings are grey, yours are cobalt, pending is
 * dashed amber and maintenance is hatched.
 */
export function AvailabilityTimeline({
  rows,
  startHour = 8,
  endHour = 18,
  hourWidth = 88,
  now,
  corner = "Resource",
  legend = true,
  emptySlotHref,
}: {
  rows: TimelineRow[];
  startHour?: number;
  endHour?: number;
  hourWidth?: number;
  /** Decimal hour of the current time; draws the red "now" line. */
  now?: number;
  corner?: string;
  legend?: boolean;
  /** When set, an empty lane is a link that starts a reservation on that resource. */
  emptySlotHref?: (row: TimelineRow) => string;
}) {
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h += 1) hours.push(h);
  const x = (t: number) => (t - startHour) * hourWidth;

  return (
    <div className="rv-tl" style={{ ["--hour" as string]: `${hourWidth}px` }}>
      <div className="rv-tl-grid">
        <div className="rv-tl-corner">{corner}</div>
        <div className="rv-tl-hours">
          {hours.map((hour) => (
            <span key={hour}>{`${String(hour).padStart(2, "0")}:00`}</span>
          ))}
        </div>

        {rows.map((row) => (
          <RowCells key={row.id} row={row} hours={hours} hourWidth={hourWidth} x={x} now={now} startHour={startHour} endHour={endHour} emptySlotHref={emptySlotHref} />
        ))}
      </div>

      {legend ? (
        <div className="rv-tl-legend">
          {LEGEND.map(([text, token]) => (
            <span key={text}>
              <i style={{ background: `var(--${token})`, outline: "1px solid var(--border)" }} />
              {text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RowCells({
  row,
  hours,
  hourWidth,
  x,
  now,
  startHour,
  endHour,
  emptySlotHref,
}: {
  row: TimelineRow;
  hours: number[];
  hourWidth: number;
  x: (t: number) => number;
  now?: number;
  startHour: number;
  endHour: number;
  emptySlotHref?: (row: TimelineRow) => string;
}) {
  const laneHref = emptySlotHref?.(row);

  return (
    <>
      <div className="rv-tl-res">
        <b>{row.href ? <a href={row.href}>{row.name}</a> : row.name}</b>
        {row.meta ? <small>{row.meta}</small> : null}
      </div>
      <div className="rv-tl-lane" style={{ width: hours.length * hourWidth }}>
        {/* Hours the resource is closed read as unavailable, not as free. */}
        {row.closedAllDay ? (
          <div className="rv-tl-closed" style={{ left: 0, right: 0 }} title={`${row.name} is closed`} />
        ) : (
          <>
            {row.openFrom != null && row.openFrom > startHour ? (
              <div className="rv-tl-closed" style={{ left: 0, width: x(row.openFrom) }} aria-hidden="true" />
            ) : null}
            {row.openTo != null && row.openTo < endHour ? (
              <div className="rv-tl-closed" style={{ left: x(row.openTo), right: 0 }} aria-hidden="true" />
            ) : null}
          </>
        )}

        {/* An empty lane is the fastest way into a booking: click it to start one. */}
        {!row.closedAllDay && laneHref ? (
          <a
            href={laneHref}
            aria-label={`Reserve ${row.name}`}
            style={{ position: "absolute", inset: 0 }}
            title={`Click to reserve ${row.name}`}
          />
        ) : null}

        {row.blocks.map((block, i) => {
          const kind = block.kind ?? "busy";
          const label =
            kind === "blocked" ? (
              <span>
                <Icon name="wrench" size="sm" />
                {block.title || "Maintenance"}
              </span>
            ) : (
              <>
                <b>{block.title}</b>
                <small>{`${formatHour(block.start)}–${formatHour(block.end)}`}</small>
              </>
            );

          const style = { left: x(block.start) + 2, width: (block.end - block.start) * hourWidth - 4 };
          const className = ["rv-tl-block", `rv-tl-${kind}`, block.conflict ? "conflict" : ""].filter(Boolean).join(" ");
          const title = `${block.title || kind} ${formatHour(block.start)}–${formatHour(block.end)}`;

          return block.href ? (
            <a key={i} href={block.href} className={className} style={{ ...style, textDecoration: "none" }} title={title}>
              {label}
            </a>
          ) : (
            <div key={i} className={className} style={style} title={title}>
              {label}
            </div>
          );
        })}

        {now != null && now >= startHour && now <= endHour ? <div className="rv-tl-now" style={{ left: x(now) }} aria-hidden="true" /> : null}
      </div>
    </>
  );
}
