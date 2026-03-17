/**
 * Wrapper so `bun --env-file ../../.env scripts/prisma.ts <args>` passes
 * the loaded env vars into the Prisma CLI subprocess.
 */
import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const result = spawnSync("bunx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
