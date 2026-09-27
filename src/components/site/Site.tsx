/** Shared chrome for content pages: nav (with Tools menu) and footer. */
import Link from "next/link";
import { GITHUB_URL, SUPPORT_URL, TOOL_PAGES } from "@/config/site";
import { Icon, LogoMark } from "../icons";
import { ThemeToggle, ToolsMenu } from "./SiteClient";

export function SiteNav({ active }: { active?: "about" | "tools" | "editor" }) {
  return (
    <header className="wrap nav">
      <Link className="brand" href="/" aria-label="Shotcandy editor">
        <LogoMark className="mark" />
        <span className="word">shotcandy</span>
      </Link>
      <nav className="links" aria-label="Main">
        <Link href="/" className={active === "editor" ? "on" : undefined}>
          Editor
        </Link>
        <ToolsMenu active={active === "tools"} />
        <Link
          href="/about/"
          className={active === "about" ? "on" : undefined}
          aria-current={active === "about" ? "page" : undefined}
        >
          About
        </Link>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          <Icon name="code" size="sm" /> Source
        </a>
      </nav>
      <div className="spacer" />
      <a
        className="support-link"
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Support this project"
      >
        <Icon name="heart" /> <span className="support-text">Support</span>
      </a>
      <Link
        className="btn btn-primary btn-sm"
        href="/"
        style={{ height: 40, padding: "0 16px 3px" }}
      >
        Open the editor
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap cols">
        <div style={{ flex: 1.4 }}>
          <Link
            className="brand"
            href="/"
            style={{ marginBottom: 12, display: "flex", width: "fit-content" }}
          >
            <LogoMark className="mark" />
            <span className="word">shotcandy</span>
          </Link>
          <p style={{ maxWidth: 300, lineHeight: "21px" }}>
            Free, open-source screenshot beautifier. Runs in your browser. MIT licensed.
          </p>
          <div className="theme-row">
            <ThemeToggle />
          </div>
        </div>
        <div>
          <h2>Tools</h2>
          {TOOL_PAGES.map((t) => (
            <Link key={t.href} href={t.href}>
              {t.label}
            </Link>
          ))}
        </div>
        <div>
          <h2>Project</h2>
          <Link href="/about/">About</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
          <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">
            Changelog
          </a>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--sc-accent-text)", fontWeight: 700 }}
          >
            Support this project
          </a>
        </div>
        <div>
          <h2>Privacy</h2>
          <p style={{ maxWidth: 220, lineHeight: "21px" }}>
            No accounts, no tracking, no uploads. Your images stay on your device.
          </p>
        </div>
      </div>
    </footer>
  );
}
