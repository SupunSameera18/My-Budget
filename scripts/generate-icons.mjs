import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

const iconSvg = readFileSync("public/icons/icon.svg");
const maskableSvg = readFileSync("public/icons/icon-maskable.svg");

await sharp(iconSvg)
  .resize(192, 192)
  .png()
  .toFile("public/icons/icon-192x192.png");
await sharp(iconSvg)
  .resize(512, 512)
  .png()
  .toFile("public/icons/icon-512x512.png");
await sharp(maskableSvg)
  .resize(512, 512)
  .png()
  .toFile("public/icons/icon-512x512-maskable.png");
await sharp(iconSvg)
  .resize(180, 180)
  .png()
  .toFile("public/apple-touch-icon.png");

console.log("Icons generated successfully");
