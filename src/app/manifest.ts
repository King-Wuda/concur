import type { MetadataRoute } from "next";

/**
 * Lets the site be added to a phone's home screen and open like an app: full
 * screen, no browser bars, with its own icon. On an iPhone that is Safari's
 * Share -> Add to Home Screen, which also reads apple-icon.png beside this file.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Budget",
    short_name: "Budget",
    description: "Personal monthly budgeting in rand.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#f9f9f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
