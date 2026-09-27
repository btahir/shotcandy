import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site/Site";
import { TOOL_PAGES } from "@/config/site";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page melted. Open the Shotcandy editor to make your screenshots look lovely.",
  robots: { index: false },
};

/** The wrapped sweet from the logo, slumped into a glossy puddle. */
function MeltedSweet() {
  return (
    <svg className="nf-art" viewBox="0 0 320 240" aria-hidden="true">
      <defs>
        <linearGradient id="nf-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6A8F" />
          <stop offset="1" stopColor="#E23A66" />
        </linearGradient>
        <linearGradient id="nf-end" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF9A3C" />
          <stop offset="1" stopColor="#E07A22" />
        </linearGradient>
        <linearGradient id="nf-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="nf-shadow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="var(--sc-ink)" stopOpacity=".16" />
          <stop offset="1" stopColor="var(--sc-ink)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="214" rx="138" ry="16" fill="url(#nf-shadow)" />
      {/* Puddle */}
      <path
        d="M44 206c0-12 22-18 52-19 18-1 30 4 64 4s50-6 70-4c26 2 46 8 46 19 0 10-26 16-116 16S44 216 44 206Z"
        fill="url(#nf-body)"
      />
      <path
        d="M70 202c10-6 40-8 58-6M200 197c16-1 34 1 46 5"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Wrapper ends, drooping */}
      <g transform="rotate(-18 92 120)">
        <path
          d="M104 98c-14 0-22-15-31-27-3-4-9-2-9 3 1 8 3 16 7 24-6 4-9 9-9 14s3 10 9 14c-4 8-6 16-7 24 0 5 6 7 9 3 9-12 17-27 31-27Z"
          fill="url(#nf-end)"
        />
      </g>
      <g transform="rotate(24 228 132) translate(456 0) scale(-1 1)">
        <path
          d="M240 110c-14 0-22-15-31-27-3-4-9-2-9 3 1 8 3 16 7 24-6 4-9 9-9 14s3 10 9 14c-4 8-6 16-7 24 0 5 6 7 9 3 9-12 17-27 31-27Z"
          fill="url(#nf-end)"
        />
      </g>
      <rect x="98" y="100" width="14" height="24" rx="6" fill="#E07A22" />
      <rect x="208" y="100" width="14" height="24" rx="6" fill="#E07A22" />
      {/* Body, slumping into the puddle with two drips */}
      <path
        d="M106 88c0-16 12-28 28-28h52c16 0 28 12 28 28v54c0 10 4 18 10 26 7 9 3 22-10 22h-18c-8 0-10 6-11 13-1 9-13 9-14 0-1-7-4-13-12-13h-26c-7 0-9 7-9 15 0 10-14 10-14 0 0-9-3-15-10-15h-4c-12 0-16-12-9-21 6-8 9-16 9-27Z"
        fill="url(#nf-body)"
      />
      <path d="M106 88c0-16 12-28 28-28h52c16 0 28 12 28 28v28H106Z" fill="url(#nf-shine)" />
      <g fill="#fff">
        <circle cx="130" cy="84" r="6" />
        <circle cx="147" cy="84" r="6" fillOpacity=".8" />
        <circle cx="164" cy="84" r="6" fillOpacity=".6" />
      </g>
      {/* A little worried face */}
      <path
        d="M142 132c8-5 22-5 30 0"
        stroke="#fff"
        strokeOpacity=".85"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="page">
      <SiteNav />
      <main className="wrap nf">
        <MeltedSweet />
        <p className="eyebrow">
          <span className="dot">404</span> Page not found
        </p>
        <h1 className="h1">
          This page <em>melted.</em>
        </h1>
        <p className="lede nf-lede">
          The link may be old or mistyped. Everything sweet is still in the editor, and it runs
          right here in your browser.
        </p>
        <div className="nf-actions">
          <Link className="btn btn-primary btn-xl" href="/">
            Open the editor
          </Link>
          <Link className="btn btn-secondary btn-xl" href="/about/">
            About Shotcandy
          </Link>
        </div>
        <nav className="tag-list nf-tools" aria-label="Tools">
          {TOOL_PAGES.map((t) => (
            <Link key={t.href} href={t.href}>
              {t.label}
            </Link>
          ))}
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
