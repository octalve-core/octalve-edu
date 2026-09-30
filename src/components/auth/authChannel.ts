// Cross-tab sign-out. Signing out in one tab must sign out every open tab of
// this app — on a shared school computer, another tab left showing a signed-in
// dashboard is a real privacy problem. BroadcastChannel is same-origin only.

const CHANNEL_NAME = "octalve-auth";

export function broadcastSignOut(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: "signed-out" });
  channel.close();
}

/// Calls `onSignOut` when another tab signs out. Returns a cleanup function.
export function onSignOutElsewhere(onSignOut: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data?.type === "signed-out") onSignOut();
  };
  return () => channel.close();
}
