import type { CompletionRule } from "@/lib/programs/assessment-rules";

// The words of the Completion tab (task 0027, slice P5). Pure, so each is unit-tested without a browser.

/// The program's completion rule in a sentence.
export function ruleText(rule: CompletionRule): string {
  const parts: string[] = [];
  if (rule.minAverage !== null) parts.push(`an average of at least ${rule.minAverage}%`);
  if (rule.requirePassed) parts.push("every required assessment passed");
  return parts.length === 0
    ? "There is no completion rule: anyone taking part can be completed."
    : `To be completed without an override a person needs ${parts.join(" and ")}.`;
}
