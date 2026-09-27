/** Highlighted-line lists as typed by people ("2, 5-7"). */

/** "2, 5-7" -> [2, 5, 6, 7] */
export function parseLineList(text: string, max = 2000): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[\s,;]+/)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= max; i++) if (i >= 1) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** [2, 5, 6, 7] -> "2, 5-7" */
export function formatLineList(lines: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j]! + 1) j++;
    out.push(j > i ? `${lines[i]}-${lines[j]}` : String(lines[i]));
    i = j + 1;
  }
  return out.join(", ");
}
