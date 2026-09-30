"use client";
/** The paste card (desktop) and the "Make a screenshot lovely" card (narrow). */
import { useEffect, useState } from "react";
import { ACCEPT_ATTRIBUTE, ACCEPT_IMAGES } from "@/engine";
import {
  type PickedFile,
  filesFromDirectoryInput,
  readDirectoryHandle,
} from "@/engine/input/files";
import { isApple } from "@/lib/platform";
import { Icon } from "../icons";
import { isBatch } from "@/engine/batch/batch";
import { useStore } from "@/lib/store";
import { useApp, useScene, useUi } from "./context";
import { MODES } from "./modes";

/** "Or make…": the other modes, from the empty screenshot state. */
function ModePicks({ narrow }: { narrow?: boolean }) {
  const app = useApp();
  const picks = MODES.filter((m) => m.id !== "screenshot");
  const sub: Record<string, string> = {
    code: "Paste code, pick a theme",
    post: "Posts and testimonials",
    appstore: "3–10 slides, exact sizes",
  };
  return (
    <nav className={`mode-picks${narrow ? " narrow" : ""}`} aria-label="Make something else">
      <span className="mp-label">Or make</span>
      {picks.map((m) => (
        <button
          key={m.id}
          type="button"
          className="mode-pick"
          data-testid={`pick-${m.id}`}
          onClick={() => app.setMode(m.id)}
        >
          <span className="mp-icon">
            <Icon name={m.icon} size="sm" />
          </span>
          <span className="mp-txt">
            <b>
              {m.id === "code"
                ? "A code image"
                : m.id === "post"
                  ? "A post card"
                  : "An App Store set"}
            </b>
            <small>{sub[m.id]}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

/** The site's tool pages as plain links, quietly at the foot of the empty state. */
const TOOL_LINKS: [string, string][] = [
  ["/batch-screenshot-editor/", "Batch editor"],
  ["/screenshot-mockup/", "Mockups"],
  ["/code-screenshot/", "Code images"],
  ["/redact-screenshot/", "Redact"],
  ["/app-store-screenshots/", "App Store"],
  ["/tools/", "All tools"],
];

function ToolLinks({ narrow }: { narrow?: boolean }) {
  return (
    <nav className={`empty-links${narrow ? " narrow" : ""}`} aria-label="Tools">
      {TOOL_LINKS.map(([href, label], i) => (
        <span key={href}>
          {i > 0 && (
            <span className="sep" aria-hidden="true">
              ·
            </span>
          )}
          <a href={href}>{label}</a>
        </span>
      ))}
    </nav>
  );
}

export const SAMPLES = [
  { id: "sample-dashboard-light", label: "Try the dashboard sample", pos: "left top" },
  { id: "sample-mobile-habits", label: "Try the phone sample", pos: "center top" },
  { id: "sample-terminal-code", label: "Try the code sample", pos: "left top" },
] as const;

/** File picker; defaults to screenshots only (pass ACCEPT_ATTRIBUTE to allow recordings). */
export function openFilePicker(onFile: (f: File) => void, accept = ACCEPT_IMAGES) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

/** File picker for one or several files (several start a batch). */
export function openFilesPicker(onFiles: (f: File[]) => void, accept = ACCEPT_IMAGES) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = true;
  input.onchange = () => {
    const list = Array.from(input.files ?? []);
    if (list.length) onFiles(list);
  };
  input.click();
}

/** Pick a folder of screenshots (File System Access where it exists, else webkitdirectory). */
export function openFolderPicker(onFiles: (f: PickedFile[]) => void) {
  const w = window as unknown as {
    showDirectoryPicker?: (o: object) => Promise<Parameters<typeof readDirectoryHandle>[0]>;
  };
  if (typeof w.showDirectoryPicker === "function") {
    w.showDirectoryPicker({ id: "shotcandy-import", mode: "read" }).then(
      async (dir) => onFiles(await readDirectoryHandle(dir)),
      () => undefined,
    );
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  input.multiple = true;
  input.onchange = () => {
    const list = filesFromDirectoryInput(input.files ?? []);
    if (list.length) onFiles(list);
  };
  input.click();
}

/** Whether this browser can pick a folder at all. */
export function canPickFolder(): boolean {
  if (typeof window === "undefined") return false;
  if (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    "function"
  )
    return true;
  return "webkitdirectory" in document.createElement("input");
}

function useMod() {
  const [apple, setApple] = useState(true);
  useEffect(() => setApple(isApple()), []);
  return apple ? "⌘" : "Ctrl";
}

function SampleButtons({ order }: { order: readonly (typeof SAMPLES)[number][] }) {
  const app = useApp();
  return (
    <>
      {order.map((s) => (
        <button
          key={s.id}
          type="button"
          className="sample"
          aria-label={s.label}
          title={s.label}
          style={{
            backgroundImage: `url(/samples/thumbs/${s.id}.webp)`,
            backgroundPosition: s.pos,
          }}
          onClick={() => void app.loadSample(s.id)}
        />
      ))}
    </>
  );
}

export function EmptyState({ narrow }: { narrow?: boolean }) {
  const app = useApp();
  const drag = useUi((s) => s.drag);
  const importing = useUi((s) => s.importing);
  const recents = useUi((s) => s.recents.length);
  const mod = useMod();
  // One file opens as always; several start a batch.
  const choose = () =>
    openFilesPicker((f) => void app.importFiles(f, { source: "file" }), ACCEPT_ATTRIBUTE);

  if (narrow)
    return (
      <div className="empty-wrap">
        <div className="m-empty" data-testid="empty-state">
          {importing && <span className="progress-shimmer" aria-hidden="true" />}
          <div className="fan" aria-hidden="true">
            <div className="f f1">
              <img src="/empty/fan-mint.webp" alt="" width={140} height={96} fetchPriority="high" />
            </div>
            <div className="f f3">
              <img
                src="/empty/fan-midnight.webp"
                alt=""
                width={140}
                height={96}
                fetchPriority="high"
              />
            </div>
            <div className="f f2">
              <img
                src="/empty/fan-phone.webp"
                alt=""
                width={140}
                height={96}
                fetchPriority="high"
              />
            </div>
          </div>
          {/* Not an h1: the static page ships both layouts, and the desktop heading is the h1. */}
          <h2 className="m-title">Make a screenshot lovely</h2>
          <p>Pick one from your photos, or paste one you copied.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={choose}>
            <Icon name="image" /> Choose a screenshot
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 10 }}
            onClick={() => void app.pasteFromClipboard()}
          >
            <Icon name="copy" /> Paste from clipboard
          </button>
          <div className="samples">
            Try a sample <SampleButtons order={[SAMPLES[1], SAMPLES[0], SAMPLES[2]]} />
          </div>
          {recents > 0 && (
            <button
              type="button"
              className="link"
              style={{ marginTop: 12 }}
              onClick={() => app.ui.set({ modal: "recents" })}
            >
              <Icon name="clock" size="xs" /> Open a recent design
            </button>
          )}
          <div className="privacy-line">
            <Icon name="lock" size="sm" /> Free, open-source screenshot beautifier. Stays on your
            phone.
          </div>
          <ModePicks narrow />
        </div>
        <ToolLinks narrow />
      </div>
    );

  return (
    <div className="empty-wrap">
      <div className="empty-stack">
        <div className={`paste-card${drag ? " is-drag" : ""}`} data-testid="empty-state">
          {importing && <span className="progress-shimmer" aria-hidden="true" />}
          <div className="fan" aria-hidden="true">
            <div className="f f1">
              <img
                src="/empty/fan-mint.webp"
                alt=""
                width={170}
                height={117}
                fetchPriority="high"
              />
            </div>
            <div className="f f3">
              <img
                src="/empty/fan-midnight.webp"
                alt=""
                width={170}
                height={117}
                fetchPriority="high"
              />
            </div>
            <div className="f f2">
              <img
                src="/empty/fan-sherbet.webp"
                alt=""
                width={170}
                height={117}
                fetchPriority="high"
              />
            </div>
          </div>
          <h1>Paste a screenshot</h1>
          <p className="lede">We’ll make it look lovely in one step.</p>
          <div className="keys">
            <kbd className="kbd kbd-lg">{mod}</kbd>
            <kbd className="kbd kbd-lg">V</kbd>
            <span className="or">or drop an image or screen recording anywhere</span>
          </div>
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={choose}>
              <Icon name="upload" size="sm" /> Choose file
            </button>
            <span className="try">Try a sample</span>
            <SampleButtons order={SAMPLES} />
          </div>
          <div className="privacy">
            <Icon name="lock" size="sm" /> Free, open-source screenshot beautifier. Your image never
            leaves this browser.
          </div>
          {recents > 0 && (
            <button
              type="button"
              className="link quiet"
              style={{ marginTop: 12 }}
              onClick={() => app.ui.set({ modal: "recents" })}
            >
              <Icon name="clock" size="xs" /> Pick up a recent design
            </button>
          )}
        </div>
        <ModePicks />
      </div>
      <ToolLinks />
    </div>
  );
}

export function DropVeil() {
  const app = useApp();
  const drag = useUi((s) => s.drag);
  const batch = useScene((s) => isBatch(s.doc));
  // A multi-screen design: say which screen (or how many empty ones) the drop fills.
  useScene((s) => s.scene);
  useStore(app.screens.ui, (s) => s.target);
  if (!drag) return null;
  const screens = drag === "ok" ? app.screens.dropMessage() : null;
  return (
    <div
      className={`drop-veil${drag === "bad" ? " bad" : ""}${app.screens.active() ? " screens" : ""}`}
      data-testid="drop-veil"
    >
      <div className="msg">
        <LogoImg />
        {drag === "bad"
          ? "PNG, JPEG or WebP, please"
          : (screens ?? (batch ? "Drop to add" : "Drop to sweeten it"))}
      </div>
    </div>
  );
}

function LogoImg() {
  return <img src="/logo-mark.svg" alt="" width={44} height={44} />;
}
