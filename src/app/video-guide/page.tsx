"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Chapter {
  id: string;
  title: string;
  role: string;
  startTime: number;
  formattedTime: string;
  stepId: number;
}

export default function VideoGuidePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [hasVideo, setHasVideo] = useState<boolean>(true);

  useEffect(() => {
    fetch("/media/video-guide/chapters.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Chapter[]) => {
        setChapters(data);
        if (data.length > 0) setActiveChapterId(data[0].id);
      })
      .catch(() => setChapters([]));
  }, []);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Find active chapter
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (time >= chapters[i].startTime) {
        setActiveChapterId(chapters[i].id);
        break;
      }
    }
  };

  const seekToChapter = (startTime: number, chapterId: string) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    videoRef.current.play().catch(() => {});
    setActiveChapterId(chapterId);
  };

  return (
    <div className="min-h-screen bg-canvas text-fg">
      {/* Top Header */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-fg hover:text-brand transition-colors">
              <svg className="w-5 h-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to App</span>
            </Link>
            <span className="text-line-strong font-light">|</span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand/10 text-brand">Product Guide</span>
              <h1 className="text-sm font-semibold tracking-tight text-fg sm:text-base">End-to-End Walkthrough & Tour</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/media/video-guide/walkthrough.pdf"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface-2 text-xs font-medium text-fg shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span>Download PDF</span>
            </a>
            <a
              href="/media/video-guide/walkthrough.webm"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download Video</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Video Player Column */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="relative rounded-2xl overflow-hidden border border-line bg-surface shadow-2xl aspect-[16/9] flex items-center justify-center">
              {hasVideo ? (
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={() => setHasVideo(false)}
                >
                  <source src="/media/video-guide/walkthrough.webm" type="video/webm" />
                  <track kind="subtitles" src="/media/video-guide/walkthrough.vtt" srcLang="en" label="Captions" default />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="p-8 text-center max-w-md">
                  <div className="w-12 h-12 rounded-full bg-brand/10 text-brand mx-auto flex items-center justify-center mb-4">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-fg">Recording In Progress</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                    The automated walkthrough recording is queued or currently executing. Once the continuous run finishes, the video and
                    subtitles will appear here automatically.
                  </p>
                </div>
              )}
            </div>

            {/* Video Meta Info */}
            <div className="p-6 rounded-2xl border border-line bg-surface shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-fg">Full Product Walkthrough</h2>
                  <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                    Unbroken continuous recording across all system roles (Setup, Administration, Teachers, Students, and Guardians). Real
                    UI interactions paced naturally using the Rushing Human engine.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    100% UI Action
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    Zero Backdoors
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chapters Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <h3 className="text-sm font-bold text-fg">Chapters & Roles</h3>
                </div>
                <span className="text-xs text-fg-muted font-medium">{chapters.length} Sections</span>
              </div>

              <div className="mt-4 flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                {chapters.length > 0 ? (
                  chapters.map((ch) => {
                    const isActive = ch.id === activeChapterId;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => seekToChapter(ch.startTime, ch.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all flex items-start justify-between gap-3 border ${
                          isActive ? "bg-brand/10 border-brand/30 shadow-sm" : "hover:bg-surface-2 border-transparent text-fg-muted"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                isActive ? "bg-brand text-white" : "bg-canvas text-fg-muted border border-line"
                              }`}
                            >
                              {ch.role}
                            </span>
                          </div>
                          <p className={`text-xs font-semibold truncate ${isActive ? "text-brand" : "text-fg"}`}>{ch.title}</p>
                        </div>
                        <span className="font-mono text-xs text-fg-muted shrink-0 mt-1">{ch.formattedTime}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-fg-muted">
                    No chapter markers registered yet. Run the walkthrough generator to compile bookmarks.
                  </div>
                )}
              </div>
            </div>

            {/* Documentation Cards */}
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-fg uppercase tracking-wider">Walkthrough Deliverables</h4>

              <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-fg">Captioned PDF</p>
                    <p className="text-[11px] text-fg-muted">1 page per step with screenshots</p>
                  </div>
                </div>
                <a href="/media/video-guide/walkthrough.pdf" download className="text-xs font-medium text-brand hover:underline">
                  Download
                </a>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-fg">WebVTT Subtitles</p>
                    <p className="text-[11px] text-fg-muted">Timestamped step captions</p>
                  </div>
                </div>
                <a href="/media/video-guide/walkthrough.vtt" download className="text-xs font-medium text-brand hover:underline">
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
