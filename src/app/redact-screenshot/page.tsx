import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";

const DESC =
  "Blur, pixelate or cover emails, names and numbers with a solid box before you share a screenshot. Runs in your browser; nothing is uploaded.";

export const metadata = pageMetadata({
  path: "/redact-screenshot/",
  title: "Redact a screenshot: blur, pixelate or box · Shotcandy",
  social: "Blur or pixelate private details in a screenshot",
  description: DESC,
  image: "/og/redact-screenshot.png",
});

const d: ToolPageData = {
  slug: "redact-screenshot",
  crumb: "Redact a screenshot",
  description: DESC,
  ogImage: "/og/redact-screenshot.png",
  h1: (
    <>
      Blur or pixelate <em>private details</em> in a screenshot
    </>
  ),
  lede: "Redact a screenshot online without sending it anywhere: drag a box over an email, a name or an API key, choose blur, pixelate or a solid box, and export a clean copy.",
  style: "sherbet",
  frameLabel: "blur tool",
  target: {
    tool: "redact",
    hint: "or drop a file — the editor opens with the blur tool ready",
  },
  hero: {
    src: "/showcase/redact-hero.webp",
    alt: "A dashboard screenshot in a macOS window with the user's email pixelated and the site name blurred",
    pills: ["Pixelate", "Blur", "Nothing uploaded"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "How to redact a screenshot",
  steps: [
    [
      "Paste",
      "Paste or drop the screenshot above. The editor opens with the blur tool picked (press B for it any time).",
    ],
    [
      "Drag over the private bits",
      "Drag a box over each detail. Under Mode, choose Blur, Pixelate or Solid, and set the strength or colour.",
    ],
    [
      "Export",
      "Copy or download PNG, JPEG or WebP. The redaction is part of the pixels, not a layer on top.",
    ],
  ],
  examplesTitle: "Before, blurred and pixelated",
  more: { label: "Open the editor", href: "/?tool=redact" },
  examples: [
    {
      src: "/showcase/redact-before.webp",
      name: "Before",
      note: "email and numbers showing",
      width: 720,
      height: 360,
      alt: "The corner of an analytics dashboard showing a user's name and email and a column of visitor numbers",
    },
    {
      src: "/showcase/redact-blur.webp",
      name: "Blur",
      note: "strength 14",
      width: 720,
      height: 360,
      alt: "The same dashboard corner with the name, email and visitor numbers blurred",
    },
    {
      src: "/showcase/redact-pixelate.webp",
      name: "Pixelate",
      note: "14 px blocks",
      width: 720,
      height: 360,
      alt: "The same dashboard corner with the name, email and visitor numbers pixelated into large blocks",
    },
  ],
  uses: {
    title: "What people usually hide",
    intro:
      "Most screenshots carry something that shouldn't travel: a customer's name, your own email, a token in a terminal.",
    items: [
      [
        "Emails and names",
        "User menus, comment threads, CRM rows and support tickets. Cover the whole line, not just the part that looks sensitive.",
      ],
      [
        "API keys, tokens and passwords",
        "Terminal output and settings pages. Use a solid box, and rotate the key anyway if it was ever visible in a shared image.",
      ],
      [
        "Numbers",
        "Revenue, balances, order totals and IDs in dashboards you want to show without the figures.",
      ],
      ["Addresses and phone numbers", "Checkout pages, maps and contact forms."],
      [
        "Faces and avatars",
        "Profile pictures in team lists or video calls. Blur works well here because shapes, not text, are the concern.",
      ],
      [
        "Browser chrome",
        "Other tabs, bookmarks and the address bar. Or crop them out and add a clean browser frame instead.",
      ],
    ],
  },
  sections: [
    {
      title: "Blur, pixelate or solid box: which is safe?",
      body: (
        <>
          <p>
            All three hide the detail from a casual look. They differ in how much of the original
            survives in the pixels.
          </p>
          <ul>
            <li>
              <b>Solid</b> covers the area with one flat colour: Auto (dark or light, picked from
              what&apos;s around it), black, white or your own. Nothing of the original is left, so
              it&apos;s the right choice for passwords, keys and anything that must never be
              recovered.
            </li>
            <li>
              <b>Pixelate</b> averages the area into blocks. Large blocks are safe for most things.
              Small blocks over short text can sometimes be guessed back, because researchers have
              shown that pixelated text can be matched against rendered guesses.
            </li>
            <li>
              <b>Blur</b> looks the softest. A light blur over text can leave enough shape to read
              or reconstruct, so turn the strength up for text, or use one of the other two.
            </li>
          </ul>
          <p>
            A rule of thumb: if you&apos;d be upset to see it recovered, use a solid box. Keep blur
            and pixelate for things that only need to be unreadable at a glance, like faces or
            figures in a demo.
          </p>
        </>
      ),
    },
    {
      title: "Redact a screenshot without uploading it",
      body: (
        <>
          <p>
            Many online redaction tools ask you to upload the very image you&apos;re trying to keep
            private. Shotcandy is a static website: the screenshot is decoded, redacted and exported
            inside your browser tab. There is no server that could receive it, and no account.
          </p>
          <p>
            The export contains only the redacted pixels. The original screenshot does stay in your
            design (so you can move a box later), in your browser&apos;s storage and in any{" "}
            <code>.shotcandy</code> project file you save. Share the exported image, not the project
            file.
          </p>
        </>
      ),
    },
    {
      title: "Then make it look good",
      body: (
        <p>
          Redaction boxes stick to the screenshot, so they stay in place when you change the style,
          add a <Link href="/macos-window-frame/">window frame</Link>, tilt the card or resize the
          canvas for X or LinkedIn. In a <Link href="/batch-screenshot-editor/">batch</Link>, each
          image keeps its own boxes, and in a{" "}
          <Link href="/screenshot-mockup/">multi-screen design</Link> they stay on the screen you
          drew them on.
        </p>
      ),
    },
  ],
  compare: {
    title: "Redaction methods compared",
    intro: "The same three options, side by side.",
    tools: [{ name: "Solid" }, { name: "Pixelate" }, { name: "Blur" }],
    rows: [
      {
        feature: "What's left of the original",
        values: ["Nothing", "Block averages", "A smoothed version"],
      },
      {
        feature: "Best for",
        values: ["Passwords, keys, IDs", "Names, emails, numbers", "Faces, photos, backgrounds"],
      },
      {
        feature: "Looks",
        values: ["Deliberate, obvious", "Clearly censored", "Soft, least distracting"],
      },
      {
        feature: "Risk on short text",
        values: ["None", "Low with large blocks", "Higher with a light blur"],
      },
    ],
    note: "Rules of thumb, not guarantees: when in doubt, use a solid box.",
  },
  faqTitle: "Screenshot redaction FAQ",
  faq: [
    [
      "Is my screenshot uploaded when I redact it?",
      "No. Everything happens in your browser. Shotcandy has no server to upload to.",
    ],
    [
      "Can someone undo the blur in my exported image?",
      "Not by removing a layer: the export is a flat image. But a light blur or small pixel blocks over text can sometimes be reconstructed. For anything sensitive, use a solid box.",
    ],
    [
      "How do I blur part of a screenshot?",
      "Paste the screenshot, press B (or pick the blur tool), and drag over the area. Under Mode, choose Blur, Pixelate or Solid, and adjust the strength or colour.",
    ],
    [
      "Can I redact a screen recording?",
      "Yes. Blur boxes work on MP4, MOV and WebM recordings too. They stay in the same place for the whole clip, so check that nothing private moves out from under them.",
    ],
    [
      "Does it work on a phone?",
      "Yes. Open the Draw tab, pick the blur tool and drag over the area with your finger.",
    ],
    [
      "Is it free?",
      "Yes, with no watermark and no account. Shotcandy is open source under the MIT license.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "All tools", href: "/tools/" },
  ],
  cta: "Open the editor with the blur tool ready.",
  editorHref: "/?tool=redact",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
