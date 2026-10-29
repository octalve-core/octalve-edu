// A path with broken percent-encoding ("%ff", "%ED%A0%80", a lone "%") cannot be decoded. Next decodes the dynamic segments of a route itself, before the route or its
// guards run, and answers a bare 500 ("Internal Server Error") for every such address under a dynamic route - a page or an API route, signed in or not. It is a bad request,
// not a server fault, so the proxy (src/proxy.ts) refuses it first, as a 400.

/// True when `pathname` (as it arrives, still percent-encoded) cannot be decoded.
export function isMalformedPath(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}
