import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";

function cover(ctx: SKRSContext2D, image: Image, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  ctx.restore();
}

async function loadLogo() {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public/ApostolicWorship_DarkBackGround_Transparent.png"));
    return await loadImage(bytes);
  } catch {
    return null;
  }
}

export async function renderFeedJpeg(bytes: Buffer) {
  const image = await loadImage(bytes);
  const ratio = image.width / Math.max(image.height, 1);
  const target = Math.min(1.91, Math.max(4 / 5, ratio));
  let width = Math.min(1440, Math.max(image.width, 640));
  let height = Math.round(width / target);
  if (height > 1800) {
    height = 1800;
    width = Math.round(height * target);
  }
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  cover(ctx, image, 0, 0, width, height);
  return canvas.toBuffer("image/jpeg", 85);
}

export async function renderStoryJpeg(bytes: Buffer) {
  const image = await loadImage(bytes);
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#101536";
  ctx.fillRect(0, 0, 1080, 1920);
  cover(ctx, image, 0, 80, 1080, 1480);
  ctx.fillStyle = "#101536";
  ctx.fillRect(0, 1560, 1080, 360);
  ctx.fillStyle = "#d7def8";
  ctx.font = "700 64px sans-serif";
  ctx.fillText("Apostolic Worship", 72, 1720);
  ctx.fillStyle = "#a9b2c8";
  ctx.font = "500 32px sans-serif";
  ctx.fillText("apostolicworship.tech", 72, 1788);

  const logo = await loadLogo();
  if (logo && logo.height > 0) {
    const height = 96;
    const width = Math.min(280, Math.round((logo.width / logo.height) * height));
    ctx.drawImage(logo, 1080 - width - 64, 1648, width, height);
  }

  return canvas.toBuffer("image/jpeg", 85);
}
