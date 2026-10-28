/**
 * Visual Step Overlay and Simulated Cursor Injector
 *
 * Renders an in-page floating banner and cursor simulator so the continuous
 * video recording and captured screenshots contain rich context natively
 * without needing external ffmpeg video filters.
 */

export const OVERLAY_STYLES = `
  #walkthrough-overlay-root {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483640;
    pointer-events: none;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  .wt-card {
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 9999px;
    padding: 10px 24px 10px 14px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
    max-width: 90vw;
    color: #f8fafc;
  }

  .wt-step-badge {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 9999px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    white-space: nowrap;
  }

  .wt-role-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 9999px;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .wt-role-admin { background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border-color: rgba(168, 85, 247, 0.4); }
  .wt-role-platform { background: rgba(244, 63, 94, 0.2); color: #fecdd3; border-color: rgba(244, 63, 94, 0.4); }
  .wt-role-teacher { background: rgba(245, 158, 11, 0.2); color: #fde68a; border-color: rgba(245, 158, 11, 0.4); }
  .wt-role-pupil { background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border-color: rgba(16, 185, 129, 0.4); }
  .wt-role-parent { background: rgba(99, 102, 241, 0.2); color: #c7d2fe; border-color: rgba(99, 102, 241, 0.4); }
  .wt-role-visitor { background: rgba(100, 116, 139, 0.2); color: #e2e8f0; border-color: rgba(100, 116, 139, 0.4); }

  .wt-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .wt-title {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wt-caption {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wt-pulse-dot {
    width: 8px;
    height: 8px;
    background-color: #10b981;
    border-radius: 50%;
    margin-left: 4px;
    box-shadow: 0 0 8px #10b981;
    animation: wt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes wt-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  #walkthrough-cursor {
    position: fixed;
    top: 0;
    left: 0;
    width: 24px;
    height: 24px;
    z-index: 2147483647;
    pointer-events: none;
    transform: translate(-2px, -2px);
    transition: transform 0.04s linear;
  }

  .wt-ripple {
    position: fixed;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(14, 165, 233, 0.4);
    border: 2px solid rgba(56, 189, 248, 0.9);
    pointer-events: none;
    z-index: 2147483646;
    transform: translate(-50%, -50%) scale(0.5);
    animation: wt-ripple-anim 0.4s cubic-bezier(0, 0, 0.2, 1) forwards;
  }

  @keyframes wt-ripple-anim {
    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
  }
`;

export function getOverlayInitScript(): string {
  return `
    (() => {
      if (document.getElementById('walkthrough-overlay-root')) return;

      // Inject Styles
      const style = document.createElement('style');
      style.id = 'walkthrough-overlay-styles';
      style.textContent = ${JSON.stringify(OVERLAY_STYLES)};
      document.head.appendChild(style);

      // Inject Overlay Card
      const root = document.createElement('div');
      root.id = 'walkthrough-overlay-root';
      root.innerHTML = \`
        <div class="wt-card">
          <span id="wt-step" class="wt-step-badge">Step 00</span>
          <span id="wt-role" class="wt-role-badge wt-role-visitor">Visitor</span>
          <div class="wt-content">
            <div id="wt-title" class="wt-title">Initializing Walkthrough...</div>
            <div id="wt-caption" class="wt-caption">Setting up environment</div>
          </div>
          <div class="wt-pulse-dot" title="Recording Live"></div>
        </div>
      \`;
      document.body.appendChild(root);

      // Inject Simulated Cursor
      const cursor = document.createElement('div');
      cursor.id = 'walkthrough-cursor';
      cursor.innerHTML = \`
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 3L11.5 21L14.5 13.5L22 10.5L4.5 3Z" fill="#F8FAFC" stroke="#020617" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      \`;
      document.body.appendChild(cursor);
    })();
  `;
}
