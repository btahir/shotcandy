/** Neutral skeleton "ghost" screenshot shown in thumbnails before an image exists. */
export const GHOST_ID = "ghost:screenshot";
export const GHOST_W = 1440;
export const GHOST_H = 900;

const svg = (dark: boolean) => {
  const bg = dark ? "#2F2520" : "#FBF8F3";
  const side = dark ? "#3A2E27" : "#F1EBE2";
  const block = dark ? "#4A3B32" : "#E6DDD1";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="${bg}"/><rect width="220" height="900" fill="${side}"/><g fill="${block}"><rect x="28" y="36" width="120" height="22" rx="8"/><rect x="28" y="96" width="160" height="16" rx="6"/><rect x="28" y="130" width="140" height="16" rx="6"/><rect x="28" y="164" width="150" height="16" rx="6"/><rect x="268" y="40" width="300" height="34" rx="10"/><rect x="268" y="110" width="250" height="120" rx="18"/><rect x="540" y="110" width="250" height="120" rx="18"/><rect x="812" y="110" width="250" height="120" rx="18"/><rect x="1084" y="110" width="310" height="120" rx="18"/><rect x="268" y="260" width="1126" height="330" rx="20"/><rect x="268" y="620" width="700" height="240" rx="20"/><rect x="996" y="620" width="398" height="240" rx="20"/></g></svg>`;
};

export async function loadGhost(): Promise<ImageBitmap | null> {
  try {
    const blob = new Blob([svg(false)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const bmp = await createImageBitmap(img, { resizeWidth: 720, resizeHeight: 450 });
    URL.revokeObjectURL(url);
    return bmp;
  } catch {
    return null;
  }
}
