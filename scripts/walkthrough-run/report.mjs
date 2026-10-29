#!/usr/bin/env node

/**
 * Walkthrough Report Generator
 *
 * Compiles:
 * 1. walkthrough.vtt - WebVTT subtitles with step captions and exact millisecond timestamps
 * 2. chapters.json - Chapter bookmarks for interactive player seeking
 * 3. walkthrough.pdf - Multi-page PDF report with cover page, TOC, and step screenshots
 * 4. Publishes all deliverables to public/media/video-guide/
 */

import fs from "fs";
import path from "path";
import { chromium } from "@playwright/test";

const OUTPUT_DIR = path.resolve(process.cwd(), "out/walkthrough");
const PUBLIC_DIR = path.resolve(process.cwd(), "public/media/video-guide");
const TIMELINE_FILE = path.join(OUTPUT_DIR, "timeline.json");

function formatVttTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(milliseconds).padStart(3, "0");

  return `${hh}:${mm}:${ss}.${mmm}`;
}

function formatDisplayTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function findRecordedVideo(rawDir) {
  if (!fs.existsSync(rawDir)) return null;

  function findWebm(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findWebm(full);
        if (found) return found;
      } else if (entry.isFile() && entry.name.endsWith(".webm")) {
        return full;
      }
    }
    return null;
  }

  return findWebm(rawDir);
}

export async function generateReports() {
  console.log("Generating walkthrough reports & deliverables...");

  if (!fs.existsSync(TIMELINE_FILE)) {
    throw new Error(`Timeline file not found: ${TIMELINE_FILE}. Run the walkthrough suite first.`);
  }

  const timeline = JSON.parse(fs.readFileSync(TIMELINE_FILE, "utf-8"));
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // 1. Process Video
  const rawVideo = await findRecordedVideo(path.join(OUTPUT_DIR, "raw-results"));
  const targetVideo = path.join(PUBLIC_DIR, "walkthrough.webm");
  if (rawVideo && fs.existsSync(rawVideo)) {
    console.log(`Copying recorded video from ${rawVideo} to ${targetVideo}...`);
    fs.copyFileSync(rawVideo, targetVideo);
    fs.copyFileSync(rawVideo, path.join(OUTPUT_DIR, "walkthrough.webm"));
  } else {
    console.warn("Notice: No raw .webm video found in raw-results. Skipping video copy.");
  }

  // 2. Generate WebVTT
  console.log("Generating walkthrough.vtt...");
  let vtt = "WEBVTT - End-to-End Product Walkthrough Subtitles\n\n";

  for (let i = 0; i < timeline.length; i++) {
    const step = timeline[i];
    const start = formatVttTimestamp(step.startMs);
    const end = formatVttTimestamp(step.endMs);
    const safeTitle = step.title.replace(/>/g, "&gt;").replace(/</g, "&lt;");
    const safeCaption = step.caption.replace(/>/g, "&gt;").replace(/</g, "&lt;");

    vtt += `${i + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `<v ${step.role}>[${step.role}] ${safeTitle}: ${safeCaption}</v>\n\n`;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "walkthrough.vtt"), vtt, "utf-8");
  fs.writeFileSync(path.join(PUBLIC_DIR, "walkthrough.vtt"), vtt, "utf-8");

  // 3. Generate chapters.json
  console.log("Generating chapters.json...");
  const chapters = [];
  const seenChapters = new Set();

  for (const step of timeline) {
    const chapterName = step.chapter || step.title;
    if (!seenChapters.has(chapterName)) {
      seenChapters.add(chapterName);
      chapters.push({
        id: `ch-${chapters.length + 1}`,
        title: chapterName,
        role: step.role,
        startTime: Math.round((step.startMs / 1000) * 10) / 10,
        formattedTime: formatDisplayTime(step.startMs),
        stepId: step.id,
      });
    }
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "chapters.json"), JSON.stringify(chapters, null, 2), "utf-8");
  fs.writeFileSync(path.join(PUBLIC_DIR, "chapters.json"), JSON.stringify(chapters, null, 2), "utf-8");

  // 4. Generate PDF Report via Headless Chromium
  console.log("Generating walkthrough.pdf via Playwright Chromium...");
  const totalDurationMs = timeline.length > 0 ? timeline[timeline.length - 1].endMs : 0;
  const formattedTotalDuration = formatDisplayTime(totalDurationMs);

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>End-to-End Product Walkthrough Report</title>
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm; }
        body {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 13px;
          line-height: 1.5;
        }
        .page-break { page-break-after: always; }
        .cover {
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 90vh;
          text-align: center;
          padding: 40px 20px;
        }
        .cover h1 { font-size: 32px; font-weight: 800; color: #0284c7; margin-bottom: 8px; }
        .cover .subtitle { font-size: 16px; color: #64748b; margin-bottom: 32px; }
        .cover .meta-box {
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          max-width: 450px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          text-align: left;
        }
        .meta-item .label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 700; }
        .meta-item .val { font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 2px; }
        
        .toc { padding: 20px 0; }
        .toc h2 { font-size: 20px; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        .toc-list { list-style: none; padding: 0; margin-top: 16px; }
        .toc-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px dashed #e2e8f0;
        }
        .toc-title { font-weight: 600; color: #1e293b; }
        .toc-time { font-family: monospace; color: #0284c7; font-weight: 600; }

        .step-page {
          padding-top: 10px;
          margin-bottom: 24px;
        }
        .step-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .step-badge {
          background: #0284c7;
          color: white;
          padding: 3px 10px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 11px;
        }
        .step-role {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          padding: 3px 10px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 11px;
        }
        .step-time { font-family: monospace; color: #64748b; font-size: 12px; }
        .step-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 4px 0 2px 0; }
        .step-caption { font-size: 12px; color: #475569; margin-bottom: 12px; }
        .step-img-box {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          background: #f8fafc;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .step-img {
          width: 100%;
          height: auto;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="cover page-break">
        <h1>Product Walkthrough Report</h1>
        <div class="subtitle">Complete Continuous End-to-End Product Verification</div>
        <div class="meta-box">
          <div class="meta-item">
            <div class="label">Date</div>
            <div class="val">${new Date().toISOString().split("T")[0]}</div>
          </div>
          <div class="meta-item">
            <div class="label">Total Steps</div>
            <div class="val">${timeline.length} Steps</div>
          </div>
          <div class="meta-item">
            <div class="label">Duration</div>
            <div class="val">${formattedTotalDuration}</div>
          </div>
          <div class="meta-item">
            <div class="label">Pacing Mode</div>
            <div class="val">Rushing Human (25ms)</div>
          </div>
        </div>
      </div>

      <div class="toc page-break">
        <h2>Table of Contents & Chapters</h2>
        <ul class="toc-list">
          ${chapters
            .map(
              (ch) => `
            <li class="toc-item">
              <span class="toc-title">${ch.title} <small style="color: #64748b;">(${ch.role})</small></span>
              <span class="toc-time">${ch.formattedTime}</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
  `;

  for (let i = 0; i < timeline.length; i++) {
    const step = timeline[i];
    let imgDataUrl = "";
    if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
      const imgBuffer = fs.readFileSync(step.screenshotPath);
      imgDataUrl = `data:image/png;base64,${imgBuffer.toString("base64")}`;
    }

    htmlContent += `
      <div class="step-page ${i < timeline.length - 1 ? "page-break" : ""}">
        <div class="step-header">
          <span class="step-badge">Step ${String(step.id).padStart(2, "0")}</span>
          <span class="step-role">${step.role}</span>
          <span class="step-time">${formatDisplayTime(step.startMs)} - ${formatDisplayTime(step.endMs)}</span>
        </div>
        <div class="step-title">${step.title}</div>
        <div class="step-caption">${step.caption}</div>
        <div class="step-img-box">
          ${imgDataUrl ? `<img class="step-img" src="${imgDataUrl}" alt="${step.title}" />` : '<div style="padding: 40px; text-align: center; color: #94a3b8;">Screenshot not available</div>'}
        </div>
      </div>
    `;
  }

  htmlContent += `
    </body>
    </html>
  `;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle" });
  const pdfPath = path.join(OUTPUT_DIR, "walkthrough.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
  });
  await browser.close();

  // Copy PDF to public/media/video-guide/
  fs.copyFileSync(pdfPath, path.join(PUBLIC_DIR, "walkthrough.pdf"));
  console.log(`Successfully generated deliverables in ${OUTPUT_DIR} and ${PUBLIC_DIR}:`);
  console.log(`- walkthrough.vtt`);
  console.log(`- chapters.json`);
  console.log(`- walkthrough.pdf`);
  if (rawVideo) console.log(`- walkthrough.webm`);
}

if (process.argv[1] && process.argv[1].endsWith("report.mjs")) {
  generateReports().catch((err) => {
    console.error("Failed to generate walkthrough report:", err);
    process.exit(1);
  });
}
