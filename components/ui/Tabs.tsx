import type { ReactNode } from "react";

export type TabItem = { id: string; label: string; count?: number; href?: string };

/**
 * Tabs are links, so the selected tab lives in the URL and the BFF can read it
 * as a query parameter. That keeps a filtered view shareable and reloadable.
 */
export function TabLinks({ items, current, label }: { items: TabItem[]; current: string; label?: string }) {
  return (
    <div className="rv-tabs" role="tablist" aria-label={label}>
      {items.map((item) => {
        const selected = item.id === current;
        return (
          <a
            key={item.id}
            href={item.href ?? "#"}
            role="tab"
            className="rv-tab"
            aria-selected={selected ? "true" : "false"}
            style={{ textDecoration: "none" }}
          >
            {item.label}
            {item.count != null ? <span className="rv-tab-count">{item.count}</span> : null}
          </a>
        );
      })}
    </div>
  );
}

/** Same look, for a segmented control that filters a list in place. */
export function SegmentedLinks({ items, current, label }: { items: Array<{ id: string; label: string; href: string; count?: number }>; current: string; label?: string }) {
  return (
    <div className="rv-segmented" role="group" aria-label={label}>
      {items.map((item) => (
        <a key={item.id} href={item.href} aria-current={item.id === current ? "true" : undefined}>
          {item.label}
          {item.count != null ? <span className="rv-muted">· {item.count}</span> : null}
        </a>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="rv-filters">{children}</div>;
}
