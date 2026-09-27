"use client";
/**
 * Code mode inspector: the code editor with language auto-detect, theme tiles
 * rendered from your own code, and window options (controls, title, line
 * numbers, highlighted lines, font size, padding).
 */
import { memo, useMemo, useRef, useState } from "react";
import {
  type CodeContent,
  type Scene,
  CODE_LANGUAGES,
  CODE_STYLES,
  applyStylePatch,
  codeTokensKey,
  createScene,
  detectLanguage,
  getCodeLanguage,
} from "@/engine";
import { Icon } from "../icons";
import { Popover, Segmented, Switch, menuKeys } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp, useScene } from "./context";
import { SceneThumb } from "./SceneThumb";
import { formatLineList, parseLineList } from "@/lib/code/lines";

function useCode(): CodeContent | null {
  return useScene((s) => (s.scene.content.kind === "code" ? s.scene.content : null));
}

export function languageLabel(c: CodeContent): string {
  if (c.language === "auto") {
    const id = c.tokens?.language ?? detectLanguage(c.code);
    return `Auto · ${getCodeLanguage(id)?.label ?? "Plain text"}`;
  }
  return getCodeLanguage(c.language)?.label ?? "Plain text";
}

function LanguageMenu({ c }: { c: CodeContent }) {
  const app = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (id: string) => {
    app.setCode({ language: id });
    setOpen(false);
    app.announce(`Language: ${id === "auto" ? "auto-detect" : getCodeLanguage(id)?.label}`);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="chip lang-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language: ${languageLabel(c)}`}
        data-testid="language"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="code" size="sm" /> <span className="lang-txt">{languageLabel(c)}</span>
        <Icon name="chevronDown" size="sm" />
      </button>
      <Popover
        open={open}
        anchor={ref}
        onClose={() => setOpen(false)}
        label="Language"
        role="menu"
        className="menu lang-menu"
        width={300}
      >
        <div onKeyDown={menuKeys}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={c.language === "auto"}
            className={`menu-item${c.language === "auto" ? " current" : ""}`}
            onClick={() => pick("auto")}
          >
            <Icon name="sparkle" size="sm" /> Detect automatically
          </button>
          <div className="menu-sep" role="separator" />
          <div className="lang-grid">
            {CODE_LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={c.language === l.id}
                className={`menu-item${c.language === l.id ? " current" : ""}`}
                onClick={() => pick(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

export const CodeTray = memo(function CodeTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = useCode();
  if (!c) return null;
  const lines = c.code.split("\n").length;
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      // Indent with two spaces rather than leaving the field.
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b, value } = el;
      const next = `${value.slice(0, a)}  ${value.slice(b)}`;
      app.setCode({ code: next }, "code:text");
      requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
    }
  };
  const body = (
    <>
      <div className="input area code-input">
        <label className="sr-only" htmlFor="sc-code">
          Code
        </label>
        <textarea
          id="sc-code"
          value={c.code}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          rows={Math.min(14, Math.max(6, lines + 1))}
          placeholder="Paste your code here"
          data-testid="code-input"
          onChange={(e) => app.setCode({ code: e.target.value }, "code:text")}
          onKeyDown={onKey}
        />
      </div>
      <div className="code-row">
        <LanguageMenu c={c} />
        <label className="input code-title">
          <Icon name="folder" size="sm" />
          <span className="sr-only">Window title</span>
          <input
            placeholder="File name"
            value={c.title}
            spellCheck={false}
            onChange={(e) => app.setCode({ title: e.target.value }, "code:title")}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      </div>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-code" data-testid="code-tray">
      <div className="tray-head">
        <h2 id="t-code">Code</h2>
        <span className="meta">
          {lines} {lines === 1 ? "line" : "lines"}
        </span>
      </div>
      {body}
    </section>
  );
});

const THUMB_LINES = 9;

/** The current code, trimmed for legible thumbnails, in each theme + background. */
function useThemeScenes(c: CodeContent | null): { id: string; name: string; scene: Scene }[] {
  const base = useMemo(() => {
    if (!c) return null;
    const lines = c.code.split("\n").slice(0, THUMB_LINES);
    const code = lines.join("\n");
    const tokens =
      c.tokens && c.tokens.key === codeTokensKey(c.code, c.language)
        ? {
            ...c.tokens,
            key: codeTokensKey(code, c.language),
            lines: c.tokens.lines.slice(0, THUMB_LINES),
          }
        : null;
    return { ...c, code, tokens, highlight: c.highlight.filter((n) => n <= THUMB_LINES) };
  }, [c]);
  return useMemo(() => {
    if (!base) return [];
    return CODE_STYLES.map((st) => {
      let s = createScene({ content: { ...base, theme: st.theme } });
      s = applyStylePatch(s, st.patch);
      s = {
        ...s,
        canvas: { size: { kind: "aspect", ratioW: 16, ratioH: 10 }, padding: 56 },
      };
      return { id: st.id, name: st.name, scene: s };
    });
  }, [base]);
}

export const ThemesTray = memo(function ThemesTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = useCode();
  const scenes = useThemeScenes(c);
  if (!c) return null;
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button.preset"));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    if (!d) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + d))]?.focus();
  };
  const grid = (
    <div className={bare ? "rail" : "presets two"} onKeyDown={onKey}>
      {scenes.map(({ id, name, scene }) => {
        const on = c.theme === id.slice("code-".length);
        return (
          <button
            key={id}
            type="button"
            className={`preset${on ? " on" : ""}`}
            aria-pressed={on}
            aria-label={`${name} theme`}
            onClick={() => app.applyCodeStyle(id)}
          >
            <div className="thumb wide">
              <SceneThumb scene={scene} target={bare ? 110 : 140} priority={8} />
            </div>
            <span className="name">{name}</span>
          </button>
        );
      })}
    </div>
  );
  if (bare) return grid;
  return (
    <section className="tray" aria-labelledby="t-themes" data-testid="themes-tray">
      <div className="tray-head">
        <h2 id="t-themes">Themes</h2>
        <span className="meta">with a matching background</span>
      </div>
      {grid}
    </section>
  );
});

export const WindowTray = memo(function WindowTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const c = useCode();
  const [draft, setDraft] = useState<string | null>(null);
  if (!c) return null;
  const hlText = draft ?? formatLineList(c.highlight);
  const body = (
    <>
      <Segmented
        label="Window controls"
        value={c.chrome}
        onChange={(chrome) => app.setCode({ chrome })}
        options={[
          { value: "mac", label: "Dots" },
          { value: "minimal", label: "Title bar" },
          { value: "none", label: "None" },
        ]}
      />
      <div className="toggle-row" style={{ marginTop: 6 }}>
        <span className="label">Line numbers</span>
        <Switch
          checked={c.lineNumbers}
          label="Line numbers"
          onChange={(lineNumbers) => app.setCode({ lineNumbers })}
        />
      </div>
      <div className="sub">
        Highlight lines <span className="mono muted">e.g. 2, 5-7</span>
      </div>
      <label className="input mono-input">
        <span className="sr-only">Highlight lines</span>
        <input
          value={hlText}
          placeholder="None"
          inputMode="numeric"
          spellCheck={false}
          data-testid="highlight-lines"
          onChange={(e) => {
            setDraft(e.target.value);
            app.setCode({ highlight: parseLineList(e.target.value) }, "code:highlight");
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <div style={{ marginTop: 10 }}>
        <Slider
          label="Font size"
          value={c.fontSize}
          min={11}
          max={24}
          typedMax={32}
          typedMin={10}
          stops={[{ value: 15, label: "15" }]}
          format={(v) => `${Math.round(v)}px`}
          onChange={(v) => app.setCode({ fontSize: Math.round(v) }, "code:fontSize")}
        />
        <Slider
          label="Inner space"
          value={c.padding}
          min={12}
          max={72}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => app.setCode({ padding: Math.round(v) }, "code:padding")}
        />
      </div>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-window" data-testid="window-tray">
      <div className="tray-head">
        <h2 id="t-window">Window</h2>
      </div>
      {body}
    </section>
  );
});
