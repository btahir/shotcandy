"use client";
/** Client bits of the content pages: Tools menu, theme toggle, inline paste zone. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TOOL_PAGES } from "@/config/site";
import { isApple } from "@/lib/platform";
import { setTheme, useThemePref } from "@/lib/theme";
import { Icon } from "../icons";
import { Popover, Segmented, menuKeys } from "../ui/controls";

export function ToolsMenu({ active }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <span className="tools">
      <button
        ref={ref}
        type="button"
        className={active ? "on" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Tools <Icon name="chevronDown" size="sm" style={{ width: 14, height: 14 }} />
      </button>
      <Popover
        open={open}
        anchor={ref}
        onClose={() => setOpen(false)}
        label="Tools"
        role="menu"
        align="start"
        className="menu"
      >
        <div onKeyDown={menuKeys}>
          {TOOL_PAGES.map((t) => (
            <Link
              key={t.href}
              role="menuitem"
              className="menu-item"
              href={t.href}
              onClick={() => setOpen(false)}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Popover>
    </span>
  );
}

export function ThemeToggle() {
  const theme = useThemePref();
  return (
    <Segmented
      label="Theme"
      value={theme}
      onChange={(v) => setTheme(v)}
      style={{ width: 250 }}
      options={[
        { value: "system", label: "System", icon: <Icon name="monitor" size="xs" /> },
        { value: "light", label: "Light", icon: <Icon name="sun" size="xs" /> },
        { value: "dark", label: "Dark", icon: <Icon name="moon" size="xs" /> },
      ]}
    />
  );
}

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * "Paste a screenshot here": hands the image to the editor (via IndexedDB, or
 * sessionStorage when IndexedDB is unavailable) and opens it with a preset.
 */
export function DropInline({
  style,
  size,
  frameLabel,
}: {
  style: string;
  size?: string;
  frameLabel: string;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mod, setMod] = useState("⌘");
  useEffect(() => setMod(isApple() ? "⌘" : "Ctrl"), []);

  const go = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const { validateImageBytes, assetIdForBytes, openStore } = await import("@/engine");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = validateImageBytes(bytes);
      const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
      const id = assetIdForBytes(bytes);
      const params = new URLSearchParams({ style });
      if (size) params.set("size", size);
      const db = await openStore();
      if (db.persistent) {
        await db.assets.put({
          id,
          blob: new Blob([bytes], { type: mime }),
          mime,
          width: bmp.width,
          height: bmp.height,
          role: "content",
          createdAt: Date.now(),
        });
        params.set("open", id);
      }
      bmp.close();
      router.push(`/?${params.toString()}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Couldn't read that file. Try PNG, JPEG or WebP.");
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        void go(f);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = ACCEPT;
    i.onchange = () => i.files?.[0] && void go(i.files[0]);
    i.click();
  };

  return (
    <>
      <div
        className={`drop-inline${over ? " over" : ""}`}
        style={{ marginTop: 28 }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void go(f);
        }}
      >
        <kbd className="kbd kbd-lg">{mod}</kbd>
        <kbd className="kbd kbd-lg">V</kbd>
        <div style={{ flex: 1, lineHeight: "20px", minWidth: 180 }}>
          <b>Paste a screenshot here</b>
          <br />
          <span className="muted" style={{ fontSize: 13.5 }}>
            or drop a file — the editor opens with the {frameLabel} ready
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={choose} disabled={busy}>
          <Icon name="upload" /> {busy ? "Opening…" : "Choose file"}
        </button>
      </div>
      {error && (
        <p role="alert" className="warn-note">
          <Icon name="alert" size="sm" /> {error}
        </p>
      )}
    </>
  );
}
