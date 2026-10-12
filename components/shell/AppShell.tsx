"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar, Button, Field, Icon, Logo } from "@/components/ui";
import { signOutAction } from "@/lib/bff/actions";
import type { NavItem, NavSection } from "@/lib/bff/views/shared";

/**
 * The desktop shell: a 248px sidebar and a 64px top bar. Below 1200px the
 * sidebar becomes an icon rail; below 768px it is replaced by a bottom tab bar.
 * The active item comes from the router, so no page has to declare it.
 */
export function AppShell({
  nav,
  tabBar,
  user,
  unreadCount,
  children,
}: {
  nav: NavSection[];
  tabBar: NavItem[];
  user: { name: string; role: string; departmentName: string | null };
  unreadCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="rv-shell">
      <nav className="rv-side" aria-label="Main">
        <div className="rv-side-brand">
          <Link href="/dashboard" style={{ display: "inline-flex", textDecoration: "none", color: "inherit" }} aria-label="Reservo home">
            <Logo size={32} />
          </Link>
        </div>

        {nav.map((section) => (
          <div key={section.title}>
            <div className="rv-side-section">{section.title}</div>
            {section.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rv-nav"
                aria-current={isCurrent(item.href) ? "page" : undefined}
                title={item.label}
              >
                <Icon name={item.icon} />
                <span className="rv-side-rail-label">{item.label}</span>
                {item.count ? (
                  <span className="rv-nav-count">
                    {item.count}
                    <span className="rv-sr"> waiting</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}

        <div style={{ marginTop: "auto", paddingTop: "var(--space-4)" }}>
          <form action={signOutAction}>
            <button type="submit" className="rv-nav" title="Sign out">
              <Icon name="logout" />
              <span className="rv-side-rail-label">Sign out</span>
            </button>
          </form>
        </div>
      </nav>

      <div className="rv-shell-main">
        <header className="rv-topbar">
          <form className="rv-topbar-search" action="/resources" role="search">
            <Field
              variant="search"
              icon="search"
              name="q"
              type="search"
              placeholder="Search resources by name, place or kit…"
              aria-label="Search resources"
            />
          </form>

          <div className="rv-topbar-end">
            <Link
              href="/activity"
              className="rv-btn rv-btn-secondary rv-btn-icon"
              style={{ textDecoration: "none", position: "relative" }}
              aria-label={unreadCount ? `Notifications, ${unreadCount} new` : "Notifications"}
            >
              <Icon name="bell" />
              {unreadCount ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--danger)",
                    color: "var(--on-danger)",
                    font: "700 10px/16px var(--font-sans)",
                    textAlign: "center",
                  }}
                >
                  {unreadCount}
                </span>
              ) : null}
            </Link>
            <Avatar name={user.name} subtitle={`${user.role === "admin" ? "Admin" : "Member"}${user.departmentName ? ` · ${user.departmentName}` : ""}`} />
          </div>
        </header>

        <main>{children}</main>
      </div>

      <nav className="rv-tabbar" aria-label="Sections">
        {tabBar.map((item) => (
          <Link key={item.id} href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** A plain page header: title, one line of context and the primary action. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="rv-page-head">
      <div>
        <h1 className="rv-page-title">{title}</h1>
        {subtitle ? <p className="rv-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="rv-page-actions">{actions}</div> : null}
    </div>
  );
}

export { Button };
