// Compresses a walkthrough recording (task 0033, decision D4: "the finished video is compressed after it is made"). Playwright records a large VP8 .webm; the published copy is an H.264
// .mp4 (plays everywhere), without sound (there is none) and with the same picture size and frame rate. A VP9 .webm is made only with --vp9.
//
//   node scripts/walkthrough-run/compress.mjs <recording.webm> <output folder> [name] [--vp9]
//
// Why VP9 is off by default (measured 2026-11-12 on a 10.5 minute recon recording, 1280x720, 48.7 MB): H.264 crf 28 gave 12.9 MB in about a minute; VP9 crf 36 gave 18.5 MB, LARGER, and took
// 12 minutes (80 CPU minutes). The earlier comment here said VP9 was "smaller"; for a mostly still screen recording it was not. Turn it on, and try a higher crf, only if a host wants .webm.
//
// ffmpeg is not part of the repository. It is looked for in FFMPEG, then in ~/.local/bin, then on the PATH. Nothing is written inside the repository: the output folder is the caller's choice
// (the runner uses the pass's folder under the main checkout's git-ignored out/walkthrough/). The size before and after is printed: it goes in the pull request.

import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function findTool(name, envName) {
  const candidates = [process.env[envName], path.join(os.homedir(), ".local", "bin", name), name].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error(
    `${name} was not found (looked in ${envName}, ~/.local/bin and the PATH). Install a static ffmpeg build outside the repository.`,
  );
}

const megabytes = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;

export function compress(input, outDir, name = path.basename(input, path.extname(input)), { vp9: withVp9 = false } = {}) {
  if (!fs.existsSync(input)) throw new Error(`No recording at ${input}.`);
  fs.mkdirSync(outDir, { recursive: true });
  const ffmpeg = findTool("ffmpeg", "FFMPEG");
  const ffprobe = findTool("ffprobe", "FFPROBE");
  const seconds = Number(
    execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input], {
      encoding: "utf-8",
    }).trim(),
  );

  const mp4 = path.join(outDir, `${name}.mp4`);
  const vp9 = path.join(outDir, `${name}.vp9.webm`);
  const common = ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-an", "-vsync", "1", "-r", "25"];
  // H.264: constant quality 28 with a slow preset (a screen recording is mostly still, so this is small and sharp); yuv420p and faststart so that every player and a browser can start it.
  execFileSync(
    ffmpeg,
    [...common, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
    { stdio: "inherit" },
  );
  // VP9 (only with --vp9): constant quality 36, no bitrate cap, single pass. See the note at the top: it was larger than the H.264 and about twelve times slower.
  if (withVp9)
    execFileSync(ffmpeg, [...common, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", vp9], { stdio: "inherit" });

  const rows = [["original (VP8 .webm)", input], ["H.264 .mp4", mp4], ...(withVp9 ? [["VP9 .webm", vp9]] : [])];
  console.log(`Recording length: ${(seconds / 60).toFixed(1)} minutes`);
  for (const [label, file] of rows) console.log(`  ${label.padEnd(22)} ${megabytes(file).padStart(9)}  ${path.basename(file)}`);
  return { mp4, vp9: withVp9 ? vp9 : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const withVp9 = args.includes("--vp9");
  const [input, outDir, name] = args.filter((arg) => arg !== "--vp9");
  if (!input || !outDir) {
    console.error("Usage: node scripts/walkthrough-run/compress.mjs <recording.webm> <output folder> [name] [--vp9]");
    process.exit(2);
  }
  compress(input, outDir, name, { vp9: withVp9 });
}
