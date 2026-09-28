import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shotcandy",
    short_name: "Shotcandy",
    description:
      "Make your screenshots and screen recordings look lovely. Free, open source, in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF5EC",
    theme_color: "#FBF5EC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
