/**
 * Generate PWA icon PNGs from logo.svg
 * Run: bun run gen:icons
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { join } from "path";

const publicDir = join(import.meta.dir, "../public");
const svg = readFileSync(join(publicDir, "logo.svg"));

const icons = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "badge-72.png", size: 72 },
];

for (const { name, size } of icons) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

console.log("Done.");
