import { MESSAGE_RATE_LIMIT } from "@xekuchat/core";

// ============================================================
// Per-user message rate limiter (sliding window)
// ============================================================

const userMessageTimestamps = new Map<string, number[]>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 1000; // 1 second window

  let timestamps = userMessageTimestamps.get(userId);
  if (!timestamps) {
    timestamps = [];
    userMessageTimestamps.set(userId, timestamps);
  }

  // Remove timestamps outside the window
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= MESSAGE_RATE_LIMIT) {
    return false; // Rate limited
  }

  timestamps.push(now);
  return true;
}

// Cleanup stale entries periodically
setInterval(() => {
  const cutoff = Date.now() - 5000;
  for (const [userId, timestamps] of userMessageTimestamps) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
      userMessageTimestamps.delete(userId);
    }
  }
}, 10_000);
