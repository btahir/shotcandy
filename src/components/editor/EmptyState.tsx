"use client";
/** The paste card (desktop) and the "Make a screenshot lovely" card (narrow). */
import { useEffect, useState } from "react";
import { ACCEPT_ATTRIBUTE } from "@/engine";
import { isApple } from "@/lib/platform";
import { Icon } from "../icons";
import { useApp, useUi } from "./context";
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

export const SAMPLES = [
  { id: "sample-dashboard-light", label: "Try the dashboard sample", pos: "left top" },
  { id: "sample-mobile-habits", label: "Try the phone sample", pos: "center top" },
  { id: "sample-terminal-code", label: "Try the code sample", pos: "left top" },
] as const;

export function openFilePicker(onFile: (f: File) => void, accept = ACCEPT_ATTRIBUTE) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
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
  const choose = () => openFilePicker((f) => void app.loadBlob(f, { source: "file" }));

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
          <h1>Make a screenshot lovely</h1>
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
            <Icon name="lock" size="sm" /> Stays on your phone. No upload.
          </div>
          <ModePicks narrow />
        </div>
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
            <span className="or">or drop an image anywhere</span>
          </div>
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={choose}>
              <Icon name="upload" size="sm" /> Choose file
            </button>
            <span className="try">Try a sample</span>
            <SampleButtons order={SAMPLES} />
          </div>
          <div className="privacy">
            <Icon name="lock" size="sm" /> Your image never leaves this browser. No account, no
            upload.
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
    </div>
  );
}

export function DropVeil() {
  const drag = useUi((s) => s.drag);
  if (!drag) return null;
  return (
    <div className={`drop-veil${drag === "bad" ? " bad" : ""}`} data-testid="drop-veil">
      <div className="msg">
        <LogoImg />
        {drag === "bad" ? "PNG, JPEG or WebP, please" : "Drop to sweeten it"}
      </div>
    </div>
  );
}

function LogoImg() {
  return <img src="/logo-mark.svg" alt="" width={44} height={44} />;
}
