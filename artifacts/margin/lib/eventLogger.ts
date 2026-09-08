/**
 * Simple event logger for debugging user interactions.
 * All events are logged to the console with timestamps.
 */
export function logEvent(screen: string, action: string, details?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const detailStr = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[EVENT][${timestamp}][${screen}] ${action}${detailStr}`);
}
