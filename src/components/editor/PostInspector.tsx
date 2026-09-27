"use client";
/**
 * Post mode inspector: the card's words and person (name, handle or role,
 * avatar, text, date, rating, numbers), live card-style thumbnails, and card
 * options (theme, width, accent). Nothing is fetched: people type it in.
 */
import { memo, useMemo } from "react";
import {
  type PostContent,
  type Scene,
  POST_STYLES,
  POST_THEMES,
  applyStylePatch,
  createScene,
  initials,
} from "@/engine";
import { Icon } from "../icons";
import { Segmented } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp, useScene } from "./context";
import { openFilePicker } from "./EmptyState";
import { ColourButton } from "./Inspector";
import { SceneThumb } from "./SceneThumb";

function usePost(): PostContent | null {
  return useScene((s) => (s.scene.content.kind === "post" ? s.scene.content : null));
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  testid,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  testid?: string;
}) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <span className="input">
        <input
          value={value}
          placeholder={placeholder}
          data-testid={testid}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </span>
    </label>
  );
}

function Avatar({ c }: { c: PostContent }) {
  const app = useApp();
  const src = c.avatarAssetId ? app.library.get(c.avatarAssetId) : undefined;
  const url = useMemo(() => {
    const img = src?.images[0]?.image;
    if (!img || typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = 96;
    cv.height = 96;
    const g = cv.getContext("2d")!;
    const s = Math.min(src!.width, src!.height);
    const w = src!.images[0]!.width;
    const k = w / src!.width;
    g.drawImage(
      img,
      ((src!.width - s) / 2) * k,
      ((src!.height - s) / 2) * k,
      s * k,
      s * k,
      0,
      0,
      96,
      96,
    );
    return cv.toDataURL();
  }, [src]);
  return (
    <div className="avatar-row">
      <button
        type="button"
        className="avatar-pick"
        aria-label={c.avatarAssetId ? "Change avatar photo" : "Upload an avatar photo"}
        data-testid="avatar-upload"
        onClick={() => openFilePicker((f) => void app.setAvatar(f))}
      >
        {url ? <img src={url} alt="" /> : <span>{initials(c.name)}</span>}
        <i aria-hidden="true">
          <Icon name="upload" size="xs" />
        </i>
      </button>
      <div className="avatar-copy">
        <b>Avatar</b>
        <span>
          {c.avatarAssetId ? "Your photo, on this device only" : "Initials until you add a photo"}
        </span>
      </div>
      {c.avatarAssetId && (
        <button
          type="button"
          className="link quiet"
          onClick={() => app.setPost({ avatarAssetId: null })}
        >
          Remove
        </button>
      )}
    </div>
  );
}

export const PostTray = memo(function PostTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = usePost();
  if (!c) return null;
  const testimonial = c.variant === "testimonial";
  const body = (
    <>
      <Segmented
        label="Card type"
        value={c.variant}
        onChange={(v) => app.setPostVariant(v)}
        options={[
          { value: "social", label: "Social post", icon: <Icon name="message" size="xs" /> },
          { value: "testimonial", label: "Testimonial", icon: <Icon name="quote" size="xs" /> },
        ]}
      />
      <Avatar c={c} />
      <div className="field-grid">
        <Field
          label="Name"
          value={c.name}
          placeholder="Your name"
          testid="post-name"
          onChange={(name) => app.setPost({ name }, "post:name")}
        />
        <Field
          label={testimonial ? "Role or company" : "Handle"}
          value={c.handle}
          placeholder={testimonial ? "Founder, Acme" : "@you"}
          testid="post-handle"
          onChange={(handle) => app.setPost({ handle }, "post:handle")}
        />
      </div>
      <label className="field-stack">
        <span className="field-label">
          {testimonial ? "Quote" : "Post"} <span className="mono muted">{c.text.length}</span>
        </span>
        <span className="input area">
          <textarea
            value={c.text}
            rows={5}
            placeholder={testimonial ? "What they said…" : "What's happening?"}
            data-testid="post-text"
            onChange={(e) => app.setPost({ text: e.target.value }, "post:text")}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </span>
      </label>
      {testimonial ? (
        <div className="toggle-row">
          <span className="label">Rating</span>
          <div className="stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={c.rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={n <= c.rating ? "on" : undefined}
                onClick={() => app.setPost({ rating: c.rating === n ? 0 : n })}
              >
                <Icon name="star" size="sm" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Field
            label="Date"
            value={c.date}
            placeholder="Sep 26"
            onChange={(date) => app.setPost({ date }, "post:date")}
          />
          <div className="field-label" style={{ marginTop: 12 }}>
            Numbers <span className="muted">leave blank to hide</span>
          </div>
          <div className="metric-grid">
            {(
              [
                ["replies", "message", "Replies"],
                ["reposts", "loop", "Reposts"],
                ["likes", "heart", "Likes"],
              ] as const
            ).map(([k, ic, label]) => (
              <label key={k} className="input metric">
                <Icon name={ic} size="xs" />
                <span className="sr-only">{label}</span>
                <input
                  value={c.metrics[k]}
                  placeholder="–"
                  onChange={(e) =>
                    app.setPost({ metrics: { ...c.metrics, [k]: e.target.value } }, `post:${k}`)
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
            ))}
          </div>
        </>
      )}
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-post" data-testid="post-tray">
      <div className="tray-head">
        <h2 id="t-post">Card</h2>
        <span className="meta">typed by you · nothing fetched</span>
      </div>
      {body}
    </section>
  );
});

function useStyleScenes(c: PostContent | null): { id: string; name: string; scene: Scene }[] {
  return useMemo(() => {
    if (!c) return [];
    return POST_STYLES.map((st) => {
      let s = createScene({ content: { ...c, theme: st.theme, accent: st.accent } });
      s = applyStylePatch(s, st.patch);
      s = { ...s, canvas: { size: { kind: "aspect", ratioW: 4, ratioH: 3 }, padding: 70 } };
      return { id: st.id, name: st.name, scene: s };
    });
  }, [c]);
}

export const PostStylesTray = memo(function PostStylesTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = usePost();
  const current = useScene((s) => s.scene.meta.stylePresetId);
  const scenes = useStyleScenes(c);
  if (!c) return null;
  const grid = (
    <div className={bare ? "rail" : "presets two"}>
      {scenes.map(({ id, name, scene }) => (
        <button
          key={id}
          type="button"
          className={`preset${current === id ? " on" : ""}`}
          aria-pressed={current === id}
          aria-label={`${name} card style`}
          onClick={() => app.applyPostStyle(id)}
        >
          <div className="thumb">
            <SceneThumb scene={scene} target={bare ? 110 : 140} priority={8} />
          </div>
          <span className="name">{name}</span>
        </button>
      ))}
    </div>
  );
  if (bare) return grid;
  return (
    <section className="tray" aria-labelledby="t-post-styles" data-testid="post-styles-tray">
      <div className="tray-head">
        <h2 id="t-post-styles">Styles</h2>
      </div>
      {grid}
    </section>
  );
});

export const CardTray = memo(function CardTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = usePost();
  if (!c) return null;
  const body = (
    <>
      <div className="sub">Card colour</div>
      <div className="theme-dots" role="radiogroup" aria-label="Card colour">
        {POST_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={c.theme === t.id}
            aria-label={t.label}
            title={t.label}
            className={`theme-dot${c.theme === t.id ? " on" : ""}`}
            style={{ background: t.bg, color: t.text }}
            onClick={() => app.setPost({ theme: t.id })}
          >
            Aa
          </button>
        ))}
        <span className="accent-pick">
          <ColourButton
            value={c.accent}
            label="Accent colour"
            onChange={(hex) => app.setPost({ accent: hex }, "post:accent")}
          />
          <span>Accent</span>
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Slider
          label="Width"
          value={c.width}
          min={360}
          max={800}
          step={10}
          stops={[{ value: 560, label: "560" }]}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => app.setPost({ width: Math.round(v / 10) * 10 }, "post:width")}
        />
      </div>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-card" data-testid="card-tray">
      <div className="tray-head">
        <h2 id="t-card">Look</h2>
      </div>
      {body}
    </section>
  );
});
