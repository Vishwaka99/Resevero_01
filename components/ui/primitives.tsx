import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Logo */

export type LogoProps = {
  /** `lockup` (default) is mark + word, `mark` is the square alone. */
  layout?: "lockup" | "mark" | "stacked";
  size?: number;
  className?: string;
};

/**
 * The "lanes" mark: three booking slots on a rounded square, the middle one
 * amber as the slot just reserved. It echoes the availability timeline.
 */
export function Logo({ layout = "lockup", size = 32, className }: LogoProps) {
  const mark = (
    <svg
      className="rv-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden={layout === "mark" ? undefined : "true"}
      role={layout === "mark" ? "img" : undefined}
      aria-label={layout === "mark" ? "Reservo" : undefined}
      dangerouslySetInnerHTML={{
        __html:
          '<rect class="rv-lg-bg" width="64" height="64" rx="18"/>' +
          '<rect class="rv-lg-fg" x="14" y="16" width="24" height="9" rx="4.5"/>' +
          '<rect class="rv-lg-ac" x="24" y="27.5" width="26" height="9" rx="4.5"/>' +
          '<rect class="rv-lg-fg" x="14" y="39" width="12" height="9" rx="4.5" opacity=".45"/>' +
          '<rect class="rv-lg-fg" x="30" y="39" width="20" height="9" rx="4.5"/>',
      }}
    />
  );

  if (layout === "mark") return mark;
  return (
    <span className={cx("rv-logo", layout === "stacked" && "rv-logo-stacked", className)}>
      {mark}
      <span className="rv-logo-word" style={{ fontSize: `${Math.round(size * 0.58)}px` }}>
        Reservo
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- Button */

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  className?: string;
};

export function Button({ variant = "primary", size = "md", icon, iconRight, block, className, children, ...rest }: ButtonProps) {
  const iconOnly = Boolean(icon && !children);
  return (
    <button
      type="button"
      {...rest}
      className={cx("rv-btn", `rv-btn-${variant}`, size !== "md" && `rv-btn-${size}`, block && "rv-btn-block", iconOnly && "rv-btn-icon", className)}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? "sm" : undefined} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size="sm" /> : null}
    </button>
  );
}

/** A link styled as a button — used where navigation, not a mutation, happens. */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  block,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: IconName;
  block?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  return (
    <a
      href={href}
      {...rest}
      className={cx("rv-btn", `rv-btn-${variant}`, size !== "md" && `rv-btn-${size}`, block && "rv-btn-block", className)}
      style={{ textDecoration: "none" }}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? "sm" : undefined} /> : null}
      {children}
    </a>
  );
}

/* ----------------------------------------------------------------- Badge */

export const STATUS_LABEL = {
  confirmed: "Confirmed",
  pending: "Pending approval",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
  conflict: "Conflict",
  maintenance: "Maintenance",
  available: "Available",
  high: "High",
  admin: "Admin",
  info: "Info",
  neutral: "",
} as const;

export type BadgeStatus = keyof typeof STATUS_LABEL;

/** Status is always a word plus a colour, never colour alone. */
export function Badge({ status = "neutral", dot = true, children, className }: { status?: BadgeStatus; dot?: boolean; children?: ReactNode; className?: string }) {
  return (
    <span className={cx("rv-badge", `rv-badge-${status}`, className)}>
      {dot && status !== "admin" ? <span className="rv-dot" aria-hidden="true" /> : null}
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

/* ----------------------------------------------------------------- Field */

type FieldOwnProps = {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  variant?: "search";
  multiline?: boolean;
  className?: string;
};

export type FieldProps = FieldOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, keyof FieldOwnProps>;

export function Field({ label, hint, error, icon, variant, multiline, className, id, required, ...rest }: FieldProps) {
  const fieldId = id ?? `rv-f-${rest.name ?? label?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "input"}`;
  const describedBy = hint || error ? `${fieldId}-hint` : undefined;
  const inputClass = cx("rv-input", variant === "search" && "rv-input-search");

  const control = multiline ? (
    <textarea id={fieldId} required={required} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} className={inputClass} {...rest} />
  ) : (
    <input id={fieldId} required={required} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} className={inputClass} {...rest} />
  );

  return (
    <div className={cx("rv-field", error && "rv-field-error", className)}>
      {label ? (
        <label htmlFor={fieldId} className="rv-field-label">
          {label}
          {required ? (
            <span className="rv-req" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {icon ? (
        <div className="rv-input-wrap">
          <Icon name={icon} />
          {control}
        </div>
      ) : (
        control
      )}
      {error || hint ? (
        <span id={describedBy} className="rv-field-hint">
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- Checkbox */

export function Checkbox({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="rv-check">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  title,
  meta,
  icon,
  action,
  children,
  className,
  style,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cx("rv-card", className)} style={style}>
      {title || action || meta ? (
        <header className="rv-card-head">
          <h2 className="rv-card-title">
            {icon ? <Icon name={icon} /> : null}
            {title}
          </h2>
          {meta ? <span className="rv-card-meta">{meta}</span> : null}
          {action}
        </header>
      ) : null}
      <div className="rv-card-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ Stat */

export function Stat({ label, value, delta, trend, icon }: { label: string; value: ReactNode; delta?: string; trend?: "up" | "down"; icon?: IconName }) {
  return (
    <div className="rv-stat">
      {icon ? (
        <div className="rv-stat-icon">
          <Icon name={icon} />
        </div>
      ) : null}
      <div>
        <div className="rv-stat-label">{label}</div>
        <div className="rv-stat-value">{value}</div>
        {delta ? <div className={cx("rv-stat-delta", trend === "down" && "down")}>{delta}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Avatar */

export function Avatar({ name, subtitle, size, showName }: { name: string; subtitle?: string; size?: "sm"; showName?: boolean }) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatar = (
    <span className={cx("rv-avatar", size === "sm" && "rv-avatar-sm")} aria-hidden={subtitle != null || showName ? "true" : undefined} title={name}>
      {initials}
    </span>
  );

  if (!showName && subtitle == null) return avatar;
  return (
    <div className="rv-person">
      {avatar}
      <div style={{ minWidth: 0 }}>
        <div className="rv-person-name">{name}</div>
        {subtitle ? <div className="rv-person-sub">{subtitle}</div> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Alert */

const ALERT_ICON = { danger: "alert", warning: "clock", success: "check", info: "info" } as const;

export function Alert({
  tone = "info",
  title,
  icon,
  children,
  actions,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  title?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`rv-alert rv-alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon ?? ALERT_ICON[tone]} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {title ? <p className="rv-alert-title">{title}</p> : null}
        {children ? <div className="rv-alert-text">{children}</div> : null}
        {actions ? <div className="rv-alert-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({ icon = "calendar", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rv-empty">
      <div className="rv-empty-icon">
        <Icon name={icon} size="lg" />
      </div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Gauge */

export type GaugeSegment = { label: string; value: number; color?: string };

/** Semicircle dial split into solid segments. Never more than three series. */
export function Gauge({
  segments,
  label = "Total",
  display,
  total,
  max,
}: {
  segments: GaugeSegment[];
  label?: string;
  display?: string | number;
  total?: number;
  max?: number;
}) {
  const sum = total ?? segments.reduce((acc, s) => acc + s.value, 0);
  const ceiling = max || sum || 1;
  const R = 64;
  const cx0 = 80;
  const cy0 = 80;
  const stroke = 14;
  const gap = 0.035;

  const point = (angle: number): [number, number] => [cx0 + R * Math.cos(angle), cy0 - R * Math.sin(angle)];
  const arc = (a0: number, a1: number) => {
    const [sx, sy] = point(a0);
    const [ex, ey] = point(a1);
    return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  };

  // Walk the segments once to turn values into arcs, then render. Keeping the
  // running angle out of the render callback keeps this a pure map.
  const arcs: Array<{ key: string; d: string; color: string }> = [];
  let cursor = Math.PI;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const span = Math.PI * (segment.value / ceiling);
    if (span > 0) {
      const a0 = cursor - (i ? gap / 2 : 0);
      const a1 = cursor - span + (i < segments.length - 1 ? gap / 2 : 0);
      arcs.push({
        key: `${segment.label}-${i}`,
        d: arc(a0, Math.max(a1, a0 - span)),
        color: `var(--${segment.color ?? `chart-${i + 1}`})`,
      });
    }
    cursor -= span;
  }

  const paths = arcs.map((item) => (
    <path key={item.key} d={item.d} stroke={item.color} strokeWidth={stroke} fill="none" strokeLinecap="round" />
  ));

  return (
    <div className="rv-gauge">
      <div className="rv-gauge-svg" role="img" aria-label={`${label} ${sum}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        <svg width={160} height={92} viewBox="0 0 160 92">
          <path d={arc(Math.PI, 0)} stroke="var(--chart-track)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
          {paths}
        </svg>
        <div className="rv-gauge-total">
          <small>{label}</small>
          <b>{display ?? sum}</b>
        </div>
      </div>
      {/* Legends always print the values. */}
      <ul className="rv-legend">
        {segments.map((segment, i) => (
          <li key={segment.label}>
            <i style={{ background: `var(--${segment.color ?? `chart-${i + 1}`})` }} />
            {segment.label} <b>({segment.value})</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
