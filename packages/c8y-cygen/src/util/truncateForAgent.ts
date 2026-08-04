/**
 * Caps text returned to the agent, appending a note when truncated. Used
 * wherever a tool's raw output could be arbitrarily large - a DOM snapshot, a
 * captured network body, a Cypress failure diff, a read file. Uncapped, any
 * one of these has been observed on a live run to grow the conversation past
 * the model's context window over enough turns.
 */
export function truncateForAgent(text: string, maxChars: number, hint?: string): string {
  if (text.length <= maxChars) return text;
  const suffix = hint ? ` - ${hint}` : "";
  return `${text.slice(0, maxChars)}\n\n...[truncated ${text.length - maxChars} more characters${suffix}]`;
}
