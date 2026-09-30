/**
 * SEO and content-page checks on the static build: one h1, unique titles and
 * descriptions within limits, canonicals, valid JSON-LD, breadcrumbs, no
 * broken internal links, the sitemap, robots rules, llms.txt, drop zones that
 * open the editor in the right state, and axe on the content pages.
 */
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ORIGIN = "https://shotcandy.app";
const SAMPLES = resolve(__dirname, "../../../brand/samples");
const png = (name: string) => ({
  name: `${name}.png`,
  mimeType: "image/png",
  buffer: readFileSync(resolve(SAMPLES, `sample-${name}.png`)),
});

/** Every page that should be indexed (the sitemap must list exactly these). */
const INDEXED = [
  "/",
  "/tools/",
  "/screenshot-beautifier/",
  "/batch-screenshot-editor/",
  "/screenshot-mockup/",
  "/app-store-screenshots/",
  "/code-screenshot/",
  "/og-image-maker/",
  "/macos-window-frame/",
  "/redact-screenshot/",
  "/alternatives/",
  "/alternatives/shots-so/",
  "/alternatives/screely/",
  "/about/",
];
const ALL = [...INDEXED, "/support/"];
/** Content pages with a visible breadcrumb trail. */
const CRUMBED = INDEXED.filter((p) => p !== "/");

interface Head {
  path: string;
  h1: number;
  title: string;
  description: string;
  canonical: string | null;
  robots: string | null;
  jsonld: string[];
  links: string[];
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&") ?? null;

/** Read the static HTML as a crawler sees it (before any script runs). */
async function head(request: APIRequestContext, path: string): Promise<Head> {
  const res = await request.get(path);
  expect(res.status(), `${path} status`).toBe(200);
  const html = await res.text();
  const metas = html.match(/<meta [^>]*>/g) ?? [];
  const meta = (name: string) => {
    const t = metas.find((m) => attr(m, "name") === name);
    return t ? attr(t, "content") : null;
  };
  const canon = (html.match(/<link [^>]*rel="canonical"[^>]*>/) ?? [])[0];
  return {
    path,
    h1: (html.match(/<h1[\s>]/g) ?? []).length,
    title: (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(/&amp;/g, "&"),
    description: meta("description") ?? "",
    canonical: canon ? attr(canon, "href") : null,
    robots: meta("robots"),
    jsonld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => m[1]!,
    ),
    links: [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&")),
  };
}

test.describe("static HTML", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "HTML checks run once, in Chromium");

  let heads: Head[] = [];
  test.beforeAll(async ({ request }) => {
    heads = await Promise.all(ALL.map((p) => head(request, p)));
  });

  test("every page has exactly one h1", () => {
    for (const h of heads) expect(h.h1, `${h.path} h1 count`).toBe(1);
  });

  test("titles and descriptions are unique and within limits", () => {
    for (const h of heads) {
      expect(h.title.length, `${h.path} title "${h.title}"`).toBeLessThanOrEqual(60);
      expect(h.title.length, `${h.path} title`).toBeGreaterThan(10);
      expect(h.description.length, `${h.path} description`).toBeLessThanOrEqual(155);
      expect(h.description.length, `${h.path} description`).toBeGreaterThanOrEqual(70);
    }
    const titles = heads.map((h) => h.title);
    const descs = heads.map((h) => h.description);
    expect(new Set(titles).size, "unique titles").toBe(titles.length);
    expect(new Set(descs).size, "unique descriptions").toBe(descs.length);
  });

  test("every page has a self-referencing canonical", () => {
    for (const h of heads) expect(h.canonical, h.path).toBe(`${ORIGIN}${h.path}`);
  });

  test("JSON-LD parses and describes the site, each tool and its breadcrumbs", () => {
    for (const h of heads) {
      expect(h.jsonld.length, `${h.path} has JSON-LD`).toBeGreaterThan(0);
      const nodes = h.jsonld.flatMap((raw) => {
        expect(raw, `${h.path}: "<" is escaped`).not.toContain("<");
        const data = JSON.parse(raw) as { "@graph"?: Record<string, unknown>[] };
        return data["@graph"] ?? [data as Record<string, unknown>];
      });
      const types = nodes.map((n) => n["@type"]);
      for (const t of ["Organization", "WebSite", "WebApplication"])
        expect(types, `${h.path} has ${t}`).toContain(t);
      const app = nodes.find((n) => n["@id"] === `${ORIGIN}/#app`)!;
      expect((app.featureList as string[]).join(" ")).toMatch(/42 one-click styles/);
      if (CRUMBED.includes(h.path)) {
        const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList") as {
          itemListElement: { position: number; item: string }[];
        };
        expect(crumbs, `${h.path} has a BreadcrumbList`).toBeTruthy();
        const items = crumbs.itemListElement;
        expect(items[0]!.item).toBe(`${ORIGIN}/`);
        expect(items.at(-1)!.item).toBe(`${ORIGIN}${h.path}`);
        expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
      }
      // Tool pages say they're part of the app, and every @id they point at exists.
      const ids = new Set(nodes.map((n) => n["@id"]).filter(Boolean));
      const refs = JSON.stringify(nodes).match(/"@id":"[^"]+"/g) ?? [];
      for (const r of refs) expect(ids.has(r.slice(7, -1)), `${h.path} ${r}`).toBe(true);
    }
  });

  test("visible breadcrumbs link back to Home", () => {
    for (const h of heads.filter((x) => CRUMBED.includes(x.path)))
      expect(h.links, `${h.path} links home`).toContain("/");
  });

  test("support is noindex; every other page is indexable", () => {
    for (const h of heads) {
      if (h.path === "/support/") expect(h.robots, "support robots").toMatch(/noindex/);
      else expect(h.robots ?? "", `${h.path} robots`).not.toMatch(/noindex/);
    }
  });

  test("no internal link is broken", async ({ request }) => {
    const targets = new Set<string>();
    for (const h of heads)
      for (const l of h.links)
        if (l.startsWith("/") && !l.startsWith("//")) targets.add(l.split(/[?#]/)[0]!);
    expect(targets.size).toBeGreaterThanOrEqual(15);
    for (const t of targets) {
      const res = await request.get(t);
      expect(res.status(), `link ${t}`).toBe(200);
    }
  });

  test("the homepage links to the tool pages in plain HTML", () => {
    const home = heads.find((h) => h.path === "/")!;
    for (const p of [
      "/batch-screenshot-editor/",
      "/screenshot-mockup/",
      "/code-screenshot/",
      "/redact-screenshot/",
      "/app-store-screenshots/",
      "/tools/",
    ])
      expect(home.links, p).toContain(p);
  });

  test("images on content pages have alt text and a size", async ({ request }) => {
    for (const path of CRUMBED) {
      const html = await (await request.get(path)).text();
      for (const img of html.match(/<img [^>]*>/g) ?? []) {
        expect(img, `${path} alt`).toMatch(/alt="/);
        expect(img, `${path} width`).toMatch(/width="\d+"/);
        expect(img, `${path} height`).toMatch(/height="\d+"/);
        const src = attr(img, "src");
        if (src?.startsWith("/")) expect((await request.get(src)).status(), src).toBe(200);
      }
    }
  });
});

test.describe("sitemap, robots and llms.txt", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "runs once, in Chromium");

  test("the sitemap lists every indexable page, with dates, and not support", async ({
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(ORIGIN, ""));
    expect(locs.sort()).toEqual([...INDEXED].sort());
    expect(xml).not.toContain("/support/");
    expect(xml).not.toMatch(/changefreq|priority/);
    const dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
    expect(dates.length).toBe(INDEXED.length);
    for (const d of dates) expect(Number.isNaN(Date.parse(d)), d).toBe(false);
  });

  test("robots.txt allows everything and points at the sitemap", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toMatch(/Allow: \//);
    expect(txt).toContain(`${ORIGIN}/sitemap.xml`);
  });

  test("llms.txt is served as text and links every tool page", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/plain/);
    const txt = await res.text();
    expect(txt.startsWith("# Shotcandy")).toBe(true);
    for (const p of INDEXED.filter((x) => x !== "/")) expect(txt, p).toContain(`${ORIGIN}${p}`);
    expect(txt).toContain("42 one-click styles");
  });
});

// ------------------------------------------------------------ drop zones

type Doc = { items?: { name?: string; content: { assetId: string } }[] };
type Win = {
  __shotcandy?: {
    ready: boolean;
    app: {
      ui: { get(): { mode: string; tool: string; hasContent: boolean } };
      scene: { layout?: { id: string; count: number }; slots?: { assetId: string | null }[] };
      store: { getState(): { doc: Doc } };
      sets: { set: { slides: { assetId: string | null }[] } };
    };
  };
};

async function chooseOnPage(page: Page, path: string, files: ReturnType<typeof png>[]) {
  await page.goto(path);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("drop-inline").getByRole("button").click(),
  ]);
  expect(chooser.isMultiple()).toBe(files.length > 1);
  await chooser.setFiles(files);
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForFunction(() => !!(window as unknown as Win).__shotcandy?.ready);
}

test.describe("drop zones open the editor in the right state", () => {
  test("batch page: several images start a batch with their names", async ({ page }) => {
    await chooseOnPage(page, "/batch-screenshot-editor/", [
      png("kanban-light"),
      png("dashboard-light"),
      png("settings-dark"),
    ]);
    await page.waitForFunction(
      () =>
        ((window as unknown as Win).__shotcandy!.app.store.getState().doc.items ?? []).length === 3,
    );
    const names = await page.evaluate(() =>
      (window as unknown as Win).__shotcandy!.app.store.getState().doc.items!.map((i) => i.name),
    );
    expect(names).toEqual(["dashboard-light.png", "kanban-light.png", "settings-dark.png"]);
    await expect(page).toHaveURL(/\/$/);
  });

  test("mockup page: three images open as one Hero design", async ({ page }) => {
    await chooseOnPage(page, "/screenshot-mockup/", [
      png("dashboard-light"),
      png("kanban-light"),
      png("landing-hero"),
    ]);
    await page.waitForFunction(() => {
      const s = (window as unknown as Win).__shotcandy!.app.scene;
      return s.layout?.id === "hero" && (s.slots ?? []).filter((x) => x.assetId).length === 2;
    });
    const doc = await page.evaluate(
      () => (window as unknown as Win).__shotcandy!.app.store.getState().doc,
    );
    expect(doc.items, "one design, not a batch").toBeUndefined();
  });

  test("layout links: Open with Fan waits for the first image", async ({ page }) => {
    await page.goto("/screenshot-mockup/");
    await page.getByRole("link", { name: "Open with Fan" }).click();
    await page.waitForFunction(() => !!(window as unknown as Win).__shotcandy?.ready);
    await expect(page).toHaveURL(/\/$/);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page
        .getByRole("button", { name: /Choose file/ })
        .first()
        .click(),
    ]);
    await chooser.setFiles([png("dashboard-light"), png("kanban-light"), png("settings-dark")]);
    await page.waitForFunction(() => {
      const s = (window as unknown as Win).__shotcandy!.app.scene;
      return s.layout?.id === "fan" && (s.slots ?? []).filter((x) => x.assetId).length === 2;
    });
  });

  test("redact page: the image opens with the blur tool armed", async ({ page }) => {
    await chooseOnPage(page, "/redact-screenshot/", [png("dashboard-light")]);
    await page.waitForFunction(() => {
      const ui = (window as unknown as Win).__shotcandy!.app.ui.get();
      return ui.hasContent && ui.tool === "redact";
    });
  });

  test("App Store page: images fill the slides of a set", async ({ page }) => {
    await chooseOnPage(page, "/app-store-screenshots/", [
      png("mobile-habits"),
      png("mobile-habits"),
    ]);
    await page.waitForFunction(() => {
      const app = (window as unknown as Win).__shotcandy!.app;
      return app.ui.get().mode === "appstore" && !!app.sets.set.slides[0]?.assetId;
    });
  });

  test("single-image pages still open one image with their style", async ({ page }) => {
    await chooseOnPage(page, "/macos-window-frame/", [png("dashboard-light")]);
    await page.waitForFunction(() => {
      const app = (window as unknown as Win).__shotcandy!.app;
      return app.ui.get().hasContent && !app.store.getState().doc.items;
    });
  });
});

// ------------------------------------------------------------ layout and axe

const NEW_PAGES = [
  "/tools/",
  "/batch-screenshot-editor/",
  "/screenshot-mockup/",
  "/app-store-screenshots/",
  "/redact-screenshot/",
  "/alternatives/",
  "/alternatives/shots-so/",
  "/alternatives/screely/",
  "/code-screenshot/",
];

for (const width of [320, 390, 768]) {
  test(`new content pages fit a ${width} px viewport with a side gutter`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of NEW_PAGES) {
      await page.goto(route);
      const m = await page.evaluate(() => {
        const h1 = document.querySelector("h1")!.getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          left: h1.left,
          right: h1.right,
        };
      });
      expect(m.scroll, `${route} scrolls sideways`).toBeLessThanOrEqual(m.inner);
      expect(m.left, `${route} h1 touches the left edge`).toBeGreaterThanOrEqual(16);
      expect(m.right, `${route} h1 touches the right edge`).toBeLessThanOrEqual(m.inner - 16);
    }
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe on content pages (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test.skip(({ browserName }) => browserName !== "chromium", "axe runs once, in Chromium");

    test("no serious or critical violations", async ({ page }) => {
      for (const route of [...NEW_PAGES, "/about/", "/macos-window-frame/", "/og-image-maker/"]) {
        await page.goto(route);
        const r = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
          bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          route,
        ).toEqual([]);
      }
    });
  });
}
