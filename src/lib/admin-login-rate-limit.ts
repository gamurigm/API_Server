const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const attempts: number[] = [];

export function checkAdminLoginRateLimit(now = Date.now()): number | null {
  while (attempts.length > 0 && attempts[0]! <= now - WINDOW_MS) {
    attempts.shift();
  }

  if (attempts.length >= MAX_ATTEMPTS) {
    return Math.max(1, Math.ceil((attempts[0]! + WINDOW_MS - now) / 1_000));
  }

  attempts.push(now);
  return null;
}

export function resetAdminLoginRateLimit(): void {
  attempts.length = 0;
}
