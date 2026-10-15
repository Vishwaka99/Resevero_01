/** Reservo icon set — drawn on a 24px grid. */
const ICONS = {
  dashboard: [
    '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    '<rect x="13" y="10" width="8" height="11" rx="2"/>',
  ],
  calendar: [
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v3M16 3v3"/>',
    '<path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3z"/><rect x="7" y="13" width="4" height="4" rx="1"/>',
  ],
  "calendar-check": [
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v3M16 3v3M8.5 15.5l2.5 2.5 4.5-4.5"/>',
    '<path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3z"/>',
  ],
  "calendar-plus": [
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v3M16 3v3M12 13v5M9.5 15.5h5"/>',
    '<path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3z"/>',
  ],
  timeline: [
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 12h18"/>',
    '<rect x="6" y="7" width="8" height="3" rx="1.5"/><rect x="10" y="14" width="8" height="3" rx="1.5"/>',
  ],
  search: ['<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>', '<circle cx="10.5" cy="10.5" r="2.5"/>'],
  bell: ['<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/>', '<circle cx="12" cy="20.5" r="2"/>'],
  plus: ['<path d="M12 5v14M5 12h14"/>', ""],
  sun: [
    '<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
    '<circle cx="12" cy="12" r="4.25"/>',
  ],
  moon: ['<path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.75 8.75 0 1 0 10.8 10.8z"/>', '<circle cx="17" cy="6.5" r="1.5"/>'],
  eye: ['<path d="M2.5 12S6 5.75 12 5.75 21.5 12 21.5 12 18 18.25 12 18.25 2.5 12 2.5 12z"/>', '<circle cx="12" cy="12" r="3"/>'],
  "eye-off": [
    '<path d="M3.5 3.5l17 17M10.4 5.95A10.4 10.4 0 0 1 12 5.75C18 5.75 21.5 12 21.5 12a17.7 17.7 0 0 1-3.3 4.1M6.9 7.15A17.4 17.4 0 0 0 2.5 12S6 18.25 12 18.25a10.3 10.3 0 0 0 3.9-.75M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    "",
  ],
  clock: ['<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>', '<circle cx="12" cy="12" r="1.75"/>'],
  pin: ['<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/>', '<circle cx="12" cy="9.5" r="2.75"/>'],
  users: [
    '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 14c2.4 0 4 1.9 4 4.5"/>',
    '<circle cx="17" cy="9" r="2.5"/>',
  ],
  check: ['<path d="m5 12.5 4.5 4.5L19 7.5"/>', ""],
  x: ['<path d="M6 6l12 12M18 6 6 18"/>', ""],
  alert: ['<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4"/>', '<circle cx="12" cy="17" r="1.25"/>'],
  info: ['<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/>', '<circle cx="12" cy="7.5" r="1.25"/>'],
  settings: ['<path d="M4 7h16M4 17h16"/>', '<circle cx="9" cy="7" r="2.75"/><circle cx="15" cy="17" r="2.75"/>'],
  chart: [
    '<path d="M4 20h16"/>',
    '<rect x="5.5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="15.5" y="9" width="3" height="9" rx="1"/>',
  ],
  box: ['<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12v9"/>', '<path d="m12 3 8 4.5-8 4.5-8-4.5z"/>'],
  building: [
    '<path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M16 10h3a1 1 0 0 1 1 1v10M3 21h18M9.5 21v-3.5h2V21"/>',
    '<rect x="8" y="7" width="2" height="2" rx=".5"/><rect x="11" y="7" width="2" height="2" rx=".5"/><rect x="8" y="11" width="2" height="2" rx=".5"/><rect x="11" y="11" width="2" height="2" rx=".5"/>',
  ],
  monitor: ['<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>', '<rect x="6" y="7" width="12" height="6" rx="1"/>'],
  car: [
    '<path d="M4 15v-3l2-5h12l2 5v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M5.5 12h13"/>',
    '<circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/>',
  ],
  inbox: [
    '<path d="M3 13 5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    '<rect x="8" y="8" width="8" height="2" rx="1"/>',
  ],
  logout: ['<path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4M15 8l4 4-4 4M19 12H9"/>', ""],
  filter: ['<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>', ""],
  more: ['<circle cx="6" cy="12" r=".75"/><circle cx="12" cy="12" r=".75"/><circle cx="18" cy="12" r=".75"/>', ""],
  wrench: ['<path d="M9 4h6l4 15H5z"/><path d="M3 19h18"/>', '<path d="M8.2 9h7.6l.8 3H7.4z"/>'],
  repeat: ['<path d="M4 11V9a3 3 0 0 1 3-3h12M20 13v2a3 3 0 0 1-3 3H5M16 3l3 3-3 3M8 21l-3-3 3-3"/>', ""],
  shield: ['<path d="M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>', '<path d="M12 3 20 6v6c0 4.5-3.4 8-8 9z"/>'],
  "chevron-left": ['<path d="m15 18-6-6 6-6"/>', ""],
  "chevron-right": ['<path d="m9 18 6-6-6-6"/>', ""],
  "chevron-down": ['<path d="m6 9 6 6 6-6"/>', ""],
  "arrow-right": ['<path d="M5 12h14M13 6l6 6-6 6"/>', ""],
  panel: ['<rect x="3" y="4" width="18" height="16" rx="3"/>', '<path d="M6 4h3v16H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/>'],
  megaphone: ['<path d="M4 10v4h3l9 5V5l-9 5z"/><path d="M7 14l1 5h2.5"/>', '<rect x="18.5" y="9.5" width="2" height="5" rx="1"/>'],
  tag: ['<path d="M3 12V4h8l10 10-7 7z"/>', '<circle cx="7.5" cy="7.5" r="1.75"/>'],
  download: ['<path d="M12 4v11M7 10l5 5 5-5"/>', '<rect x="4" y="18" width="16" height="3" rx="1.5"/>'],
} as const;

export type IconName = keyof typeof ICONS;

export const iconNames = Object.keys(ICONS) as IconName[];

export type IconProps = {
  name: IconName;
  /** 16px in chips and badges, 28px in empty states. Default 20px. */
  size?: "sm" | "lg";
  /** `line` drops the accent colour — used in dense tables. */
  tone?: "line";
  /** Wrap the icon in a 40px soft square, or a solid one for the key item in a view. */
  tile?: boolean | "solid";
  /** Set this only when the icon carries meaning on its own. */
  label?: string;
  className?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Icon({ name, size, tone, tile, label, className }: IconProps) {
  const [line, accent] = ICONS[name] ?? ICONS.info;
  const svg = (
    <svg
      className={cx("rv-icon", size === "sm" && "rv-icon-sm", size === "lg" && "rv-icon-lg", tone === "line" && "rv-icon-line", !tile && className)}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{
        __html: `<g class="rv-i-b">${line}</g>${accent ? `<g class="rv-i-a">${accent}</g>` : ""}`,
      }}
    />
  );

  if (!tile) return svg;
  return <span className={cx("rv-icon-tile", tile === "solid" && "rv-icon-tile-solid", className)}>{svg}</span>;
}
