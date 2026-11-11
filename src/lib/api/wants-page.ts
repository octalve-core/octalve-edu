// Does this request want a web page rather than data? (task 0043) A browser that follows a link sends an `Accept` that names `text/html`; a script, `curl`, a test client or a fetch for JSON does
// not (`*/*`, `application/json`, or nothing). The public verification routes use it to send a person who opened an old printed address to the page that answers in words.

export function wantsPage(accept: string | null | undefined): boolean {
  if (!accept) return false;
  return accept
    .toLowerCase()
    .split(",")
    .some((entry) => {
      const [type, ...params] = entry.trim().split(";");
      if (type.trim() !== "text/html") return false;
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return q === undefined || Number.parseFloat(q.slice(2)) > 0;
    });
}
