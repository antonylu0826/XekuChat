import { createHash, randomBytes } from "crypto";

const PREFIX = "xk_live_";

/** Generate a new API key. Returns { raw, hash, prefix }. raw is shown once only. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("hex");
  const raw = `${PREFIX}${random}`;
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 16) + "...";
  return { raw, hash, prefix };
}

/** SHA-256 hash for storage / lookup */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
