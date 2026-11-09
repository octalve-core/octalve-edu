import { Alert } from "@/components/ui/Alert";

/// What a suspended pupil is told on their portal page (task 0028): that they are suspended, until when, and what that means. Never the reason: it is the school's record. A server
/// component with no state; the page decides whether to draw it (only while a suspension applies today).
export function StandingNotice({ until }: { until: string | null }) {
  const day = until
    ? new Date(`${until}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  return (
    <Alert variant="warning">
      <strong>You are suspended{day ? ` until ${day}` : ""}.</strong> You can still read what is here, but you can&apos;t take a quiz,
      practise or hand in work until the suspension ends
      {day ? " (the date is the last day)" : " or the school lifts it"}. Please speak to the school if you have a question.
    </Alert>
  );
}
