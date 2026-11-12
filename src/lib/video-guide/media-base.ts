// Where the walkthrough's files (the video, its captions, the chapters and the PDF) are served from. The video is large and is kept out of git, so a deployment can say where it lives with
// NEXT_PUBLIC_VIDEO_GUIDE_BASE_URL: nothing (the default, files in /public/media/video-guide), a path on this site, or an https address on another host. Anything else is ignored and the
// default is used, because this value ends up in the page and in its Content-Security-Policy: it must not be able to widen the policy to a host nobody chose, or to an insecure one.
//
// Pure, so the rule can be tested without a server. Used by the page (to build the file addresses) and by the proxy (to allow that one host to be loaded from on that one page).

export const DEFAULT_VIDEO_GUIDE_BASE = "/media/video-guide";

export type VideoGuideMedia = {
  /// The folder the files are in, with no trailing slash: "/media/video-guide" or "https://media.example.org/guide".
  base: string;
  /// The other host's origin when `base` is on another host (it is allowed in the page's policy for `/video-guide` only), or null for this site.
  origin: string | null;
};

export function videoGuideMedia(raw: string | undefined | null): VideoGuideMedia {
  const fallback: VideoGuideMedia = { base: DEFAULT_VIDEO_GUIDE_BASE, origin: null };
  const value = (raw ?? "").trim();
  if (value === "") return fallback;

  if (value.startsWith("/")) {
    // A path on this site. "//host/x" is another host in disguise; a query, a fragment, a space, a backslash or ".." has no business in a folder.
    if (value.startsWith("//") || /[\\?#\s]/.test(value) || value.split("/").includes("..")) return fallback;
    const base = value.replace(/\/+$/, "");
    return base === "" ? fallback : { base, origin: null };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fallback;
  }
  // Only https, no sign-in details, no query or fragment: those would be sent to the host or change what a file address means.
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return fallback;
  return { base: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, origin: url.origin };
}
