/**
 * Shotcandy icon set (24 px grid, 2 px stroke, round caps/joins), ported from
 * docs/design/mocks/lib/icons.js. Custom glyphs: frames, shadows, blur, arrow.
 */
import { type CSSProperties, type ReactNode, useId } from "react";

type Def = { d: ReactNode; fill?: boolean; viewBox?: string; raw?: boolean };

const S: Record<string, Def> = {
  undo: {
    d: (
      <>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </>
    ),
  },
  redo: {
    d: (
      <>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </>
    ),
  },
  copy: {
    d: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="3" />
        <path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" />
      </>
    ),
  },
  download: {
    d: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
  },
  chevronDown: { d: <path d="m6 9 6 6 6-6" /> },
  chevronUp: { d: <path d="m6 15 6-6 6 6" /> },
  chevronRight: { d: <path d="m9 6 6 6-6 6" /> },
  chevronLeft: { d: <path d="m15 6-6 6 6 6" /> },
  heart: {
    fill: true,
    d: (
      <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.5 1.1 4.4 2.5.9-1.4 2.3-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21Z" />
    ),
  },
  code: {
    d: (
      <>
        <path d="m8 7-5 5 5 5" />
        <path d="m16 7 5 5-5 5" />
        <path d="m13.5 4-3 16" />
      </>
    ),
  },
  moon: { d: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> },
  sun: {
    d: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  monitor: {
    d: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2.5" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  more: {
    fill: true,
    d: (
      <>
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </>
    ),
  },
  cursor: {
    fill: true,
    d: (
      <path d="M5.5 3.2 19 10.6c.8.4.7 1.6-.2 1.8l-5.6 1.4-2.6 5.3c-.4.8-1.6.7-1.8-.2L4 4.3c-.2-.8.7-1.5 1.5-1.1Z" />
    ),
  },
  text: {
    d: (
      <>
        <path d="M5 7V5h14v2" />
        <path d="M12 5v14" />
        <path d="M9 19h6" />
      </>
    ),
  },
  arrow: {
    d: (
      <>
        <path d="M5 19C9 11 13 8 19 6" />
        <path d="M13.5 5 19 6l-1.5 5.3" />
      </>
    ),
  },
  rect: { d: <rect x="3.5" y="6" width="17" height="12" rx="3" /> },
  blur: {
    fill: true,
    d: (
      <>
        <rect x="3" y="3" width="5" height="5" rx="1.2" />
        <rect x="9.5" y="3" width="5" height="5" rx="1.2" opacity=".45" />
        <rect x="16" y="3" width="5" height="5" rx="1.2" />
        <rect x="3" y="9.5" width="5" height="5" rx="1.2" opacity=".45" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
        <rect x="16" y="9.5" width="5" height="5" rx="1.2" opacity=".45" />
        <rect x="3" y="16" width="5" height="5" rx="1.2" />
        <rect x="9.5" y="16" width="5" height="5" rx="1.2" opacity=".45" />
        <rect x="16" y="16" width="5" height="5" rx="1.2" />
      </>
    ),
  },
  plus: { d: <path d="M12 5v14M5 12h14" /> },
  minus: { d: <path d="M5 12h14" /> },
  lock: {
    d: (
      <>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </>
    ),
  },
  image: {
    d: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5-9 9" />
      </>
    ),
  },
  upload: {
    d: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
  },
  sparkle: {
    fill: true,
    d: (
      <>
        <path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z" />
        <path
          d="M19 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z"
          opacity=".6"
        />
      </>
    ),
  },
  search: {
    d: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  x: { d: <path d="M6 6l12 12M18 6 6 18" /> },
  check: { d: <path d="m5 12.5 4.5 4.5L19 7.5" /> },
  trash: {
    d: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <path d="M9 7V4h6v3" />
      </>
    ),
  },
  ratio: {
    d: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="3" />
        <path d="M7 9.5v-1h2M17 14.5v1h-2" />
      </>
    ),
  },
  keyboard: {
    d: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="3" />
        <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
      </>
    ),
  },
  shuffle: {
    d: (
      <>
        <path d="M16 3h5v5" />
        <path d="M4 20 21 3" />
        <path d="M21 16v5h-5" />
        <path d="m15 15 6 6" />
        <path d="M4 4l5 5" />
      </>
    ),
  },
  link: {
    d: (
      <>
        <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
        <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
      </>
    ),
  },
  share: {
    d: (
      <>
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 13v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5" />
      </>
    ),
  },
  eyedrop: {
    d: (
      <>
        <path d="m14 7 3 3" />
        <path d="M5 19l1-4 8.5-8.5a2.1 2.1 0 0 1 3 3L9 18z" />
      </>
    ),
  },
  sliders: {
    d: (
      <>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </>
    ),
  },
  folder: {
    d: (
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    ),
  },
  save: {
    d: (
      <>
        <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
        <path d="M8 4v5h7V4M8 20v-6h8v6" />
      </>
    ),
  },
  clock: {
    d: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
  clipboard: {
    d: (
      <>
        <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
        <path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 3.5h6" />
      </>
    ),
  },
  alert: {
    d: (
      <>
        <path d="M12 3.5 21.5 20h-19Z" />
        <path d="M12 10v4.5M12 17.5h.01" />
      </>
    ),
  },
  rotate: {
    d: (
      <>
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M20 4v5h-5" />
      </>
    ),
  },
  cube: {
    d: (
      <>
        <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      </>
    ),
  },
  alignLeft: { d: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" /> },
  alignCenter: { d: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" /> },
  alignRight: { d: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" /> },
  duplicate: {
    d: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2.5" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2M14 11v6M11 14h6" />
      </>
    ),
  },
  github: {
    fill: true,
    d: (
      <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6 0-.6 0-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1 2.9.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5Z" />
    ),
  },
  frameNone: {
    viewBox: "0 0 26 24",
    d: <rect x="3" y="4" width="20" height="16" rx="3" strokeDasharray="3 3" />,
  },
  frameMac: {
    raw: true,
    viewBox: "0 0 26 22",
    d: (
      <>
        <rect x="1" y="1" width="24" height="20" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M1 7h24" stroke="currentColor" strokeWidth="1.4" opacity=".5" />
        <circle cx="5" cy="4.1" r="1.25" fill="#F96057" />
        <circle cx="8.6" cy="4.1" r="1.25" fill="#F8BE3B" />
        <circle cx="12.2" cy="4.1" r="1.25" fill="#3AC553" />
      </>
    ),
  },
  frameBrowser: {
    raw: true,
    viewBox: "0 0 26 22",
    d: (
      <>
        <rect x="1" y="1" width="24" height="20" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M1 8h24" stroke="currentColor" strokeWidth="1.4" opacity=".5" />
        <rect x="8" y="3" width="11" height="2.6" rx="1.3" fill="currentColor" opacity=".45" />
        <circle cx="4.4" cy="4.3" r="1.1" fill="currentColor" opacity=".6" />
      </>
    ),
  },
  framePhone: {
    raw: true,
    viewBox: "0 0 26 22",
    d: (
      <>
        <rect x="8" y="1" width="10" height="20" rx="3.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="13" cy="3.6" r=".9" fill="currentColor" />
      </>
    ),
  },
  frameTablet: {
    raw: true,
    viewBox: "0 0 26 22",
    d: (
      <>
        <rect x="2" y="3" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="13" cy="5.2" r=".8" fill="currentColor" />
      </>
    ),
  },
  frameLaptop: {
    raw: true,
    viewBox: "0 0 26 22",
    d: (
      <>
        <rect x="4" y="3" width="18" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M1.5 18.5h23" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
  shNone: {
    raw: true,
    viewBox: "0 0 22 16",
    d: <rect x="3" y="2" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />,
  },
  shHug: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <rect
          x="3"
          y="2"
          width="16"
          height="11"
          rx="2.5"
          fill="currentColor"
          opacity=".18"
          transform="translate(0 1)"
        />
        <rect x="3" y="2" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  shSoft: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <ellipse cx="11" cy="13.6" rx="9" ry="2" fill="currentColor" opacity=".25" />
        <rect
          x="3"
          y="1.5"
          width="16"
          height="11"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </>
    ),
  },
  shFloat: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <ellipse cx="11" cy="14.5" rx="8" ry="1.4" fill="currentColor" opacity=".45" />
        <rect
          x="3"
          y=".8"
          width="16"
          height="10.5"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </>
    ),
  },
  shDeep: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <ellipse cx="11" cy="13.8" rx="10" ry="2.2" fill="currentColor" opacity=".6" />
        <rect
          x="3"
          y="1"
          width="16"
          height="10.5"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </>
    ),
  },
  shSolid: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <rect x="5.5" y="4.5" width="15" height="10.5" rx="2.5" fill="currentColor" opacity=".55" />
        <rect
          x="2"
          y="1.5"
          width="15"
          height="10.5"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </>
    ),
  },
  shGlow: {
    raw: true,
    viewBox: "0 0 22 16",
    d: (
      <>
        <rect x="1" y=".5" width="20" height="15" rx="5" fill="currentColor" opacity=".2" />
        <rect x="4" y="3" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
};

export type IconName = keyof typeof S;

export function Icon({
  name,
  size = "md",
  className,
  style,
}: {
  name: IconName;
  size?: "md" | "sm" | "xs";
  className?: string;
  style?: CSSProperties;
}) {
  const def = S[name]!;
  const cls = `${size === "md" ? "i" : size === "sm" ? "i-sm" : "i-xs"}${className ? ` ${className}` : ""}`;
  if (def.raw)
    return (
      <svg className={cls} style={style} viewBox={def.viewBox} fill="none" aria-hidden="true">
        {def.d}
      </svg>
    );
  if (def.fill)
    return (
      <svg
        className={cls}
        style={style}
        viewBox={def.viewBox ?? "0 0 24 24"}
        fill="currentColor"
        aria-hidden="true"
      >
        {def.d}
      </svg>
    );
  return (
    <svg
      className={cls}
      style={style}
      viewBox={def.viewBox ?? "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {def.d}
    </svg>
  );
}

/** Tangerine wrapper end (same geometry as the logo), used by the wrap toast. */
export function WrapperEnd({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 40" aria-hidden="true">
      <path
        d="M20 12C14 12 10 6 4 2c-2-1-4 0-3.4 2L2 12 .4 20 2 28 .6 36c-.6 2 1.4 3 3.4 2 6-4 10-10 16-10Z"
        fill="#FF9A3C"
      />
    </svg>
  );
}

const END =
  "M18 27.4C13.5 27.4 10.8 22.6 7.8 18.7C6.8 17.4 4.8 17.9 4.9 19.6Q5.3 23.7 7.3 27.5Q4.5 29.6 4.5 32Q4.5 34.4 7.3 36.5Q5.3 40.3 4.9 44.4C4.8 46.1 6.8 46.6 7.8 45.3C10.8 41.4 13.5 36.6 18 36.6Z";

/** Brand mark, inline so it paints with the first frame. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const end = (
    <>
      <path d={END} fill={`url(#${id}e)`} />
      <path
        d="M10.6 24.2L13.6 28.4M10.6 39.8L13.6 35.6"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6A8F" />
          <stop offset="1" stopColor="#E23A66" />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF9A3C" />
          <stop offset="1" stopColor="#E07A22" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>{end}</g>
      <g transform="matrix(-1 0 0 1 64 0)">{end}</g>
      <rect x="12.6" y="28.2" width="4.4" height="7.6" rx="2" fill="#E07A22" />
      <rect x="47" y="28.2" width="4.4" height="7.6" rx="2" fill="#E07A22" />
      <rect x="15" y="16.5" width="34" height="31" rx="10" fill={`url(#${id}b)`} />
      <rect x="15" y="16.5" width="34" height="31" rx="10" fill={`url(#${id}s)`} />
      <g fill="#fff">
        <circle cx="22" cy="23.5" r="2.1" />
        <circle cx="27.8" cy="23.5" r="2.1" fillOpacity=".8" />
        <circle cx="33.6" cy="23.5" r="2.1" fillOpacity=".6" />
      </g>
    </svg>
  );
}
