"use client";
/**
 * "Paste your code here" box for the code screenshot page: hands the code to
 * the editor (sessionStorage, never a server) and opens Code mode with it.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "../icons";

export const CODE_HANDOFF_KEY = "shotcandy:code-handoff";

export function CodeInline() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const go = () => {
    try {
      if (code.trim()) sessionStorage.setItem(CODE_HANDOFF_KEY, code);
    } catch {
      /* private mode: open the sample instead */
    }
    router.push("/?mode=code");
  };
  return (
    <div className="code-inline" style={{ marginTop: 28 }}>
      <label className="sr-only" htmlFor="code-inline">
        Your code
      </label>
      <textarea
        id="code-inline"
        value={code}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        rows={5}
        placeholder={"Paste your code here…\nfunction hello() {\n  return \"lovely\";\n}"}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
        }}
      />
      <div className="code-inline-row">
        <span className="muted">Language is detected for you · 8 themes · export PNG, MP4 or GIF</span>
        <button type="button" className="btn btn-primary" onClick={go} data-testid="make-code-image">
          <Icon name="sparkle" /> Make the image
        </button>
      </div>
    </div>
  );
}
