"use client";

import React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  MessageCircleQuestion,
  RefreshCw,
  Scissors,
  SmilePlus,
  Sparkles,
  SpellCheck,
  X,
} from "lucide-react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import { StreamText } from "@/components/beui/atoms/StreamText.tsx";

/* ─────────────────────────────────────────────────────────
  * DRAFT SELECTION ACTIONS
  * A contextual AI bar attached beneath selected draft text,
  * adapted from vendor/beautiful-ui SelectionActions. Select
  * text in the reply, pick a preset (or type an instruction),
  * the rewrite is revealed in place via StreamText, then Keep
  * applies it to the full response or Discard resets.
  * ───────────────────────────────────────────────────────── */

type Mode = "idle" | "thinking" | "streaming" | "result";

export type DraftSelectionActionsProps = {
  text: string;
  caseId: string;
  topic: string;
  truthMode: string;
  account: { fullName: string; email: string };
  enabled: boolean;
  onApply: (newFullResponse: string) => void;
};

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const iconProps = {
  size: 14,
  strokeWidth: 1.8,
  "aria-hidden": true,
} as const;

const icons = {
  explain: <MessageCircleQuestion {...iconProps} />,
  improve: <Sparkles {...iconProps} />,
  shorten: <Scissors {...iconProps} />,
  tone: <SmilePlus {...iconProps} />,
  grammar: <SpellCheck {...iconProps} />,
  send: <ArrowUp size={16} strokeWidth={2.4} aria-hidden />,
  chevron: <ChevronRight {...iconProps} />,
  check: <Check {...iconProps} />,
  close: <X {...iconProps} />,
  retry: <RefreshCw {...iconProps} />,
};

const control =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-normal text-ink transition-[background-color,color,transform] duration-150 hover:bg-hover active:scale-[0.96]";

const primary =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 text-[12.5px] font-normal text-canvas shadow-hairline transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.96]";

function busyLabelFor(action: string): string {
  switch (action) {
    case "Improve":
      return "Improving";
    case "Shorten":
      return "Shortening";
    case "Change tone":
      return "Changing tone";
    case "Fix grammar":
      return "Fixing grammar";
    case "Explain":
      return "Explaining";
    default:
      return "Editing";
  }
}

type Selection = { value: string; index: number };

export function DraftSelectionActions({
  text,
  caseId,
  topic,
  truthMode,
  account,
  enabled,
  onApply,
}: DraftSelectionActionsProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("idle");
  const [action, setAction] = useState("Improve");
  const [prompt, setPrompt] = useState("");
  const [typingWidth, setTypingWidth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rewritten, setRewritten] = useState("");
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const selectionRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousModeRef = useRef<Mode>("idle");
  const lastWidthRef = useRef(0);
  const widthAnimationRef = useRef<Animation | null>(null);
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setExpanded(false);
    setPrompt("");
    setTypingWidth(null);
    setAction("Improve");
    setRewritten("");
    setMode("idle");
    setSelection(null);
    setPositioned(false);
    if (typeof window !== "undefined") {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    reset();
  }, [text, enabled, reset]);

  const handleSelection = useCallback(() => {
    if (!enabled || mode !== "idle") return;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      setPositioned(false);
      return;
    }
    const value = sel.toString();
    const range = sel.getRangeAt(0);
    if (
      !value.trim() ||
      !textRef.current ||
      !textRef.current.contains(range.commonAncestorContainer)
    ) {
      setSelection(null);
      setPositioned(false);
      return;
    }
    const index = text.indexOf(value);
    if (index < 0) {
      setSelection(null);
      setPositioned(false);
      return;
    }
    setSelection({ value, index });
  }, [enabled, mode, text]);

  /* Attach beneath the final selected line, while centering the bar
    * against the complete selection bounds. requestAnimationFrame batches
    * streaming reflow measurements and avoids visible intermediate positions. */
  const place = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const host = hostRef.current;
      const selectionSpan = selectionRef.current;
      if (!host || !selectionSpan) return;

      const bounds = selectionSpan.getBoundingClientRect();
      const lines = Array.from(selectionSpan.getClientRects());
      const lastLine = lines.at(-1);
      if (!lastLine) return;

      const hostBounds = host.getBoundingClientRect();
      const next = {
        x: Math.round(bounds.left - hostBounds.left + bounds.width / 2),
        y: Math.round(lastLine.bottom - hostBounds.top + 8),
      };

      setAnchor((current) =>
        current.x === next.x && current.y === next.y ? current : next,
      );
      setPositioned(true);
    });
  }, []);

  useIsoLayoutEffect(() => {
    if (selection) place();
  }, [mode, selection, rewritten, place]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(place);
    observer.observe(host);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [place]);

  /* Intrinsic width handles the preset expansion. When the entire content
    * changes between idle, loading and confirmation, animate from the last
    * rendered width to the new intrinsic width before the browser paints. */
  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (!bar || !content) return;

    const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8;
    const previousWidth =
      lastWidthRef.current || Math.ceil(bar.getBoundingClientRect().width);

    if (
      previousModeRef.current !== mode &&
      Math.abs(nextWidth - previousWidth) > 1
    ) {
      widthAnimationRef.current?.cancel();
      const animation = bar.animate(
        [
          { width: `${previousWidth}px` },
          { width: `${nextWidth}px` },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.23,1,0.32,1)",
        },
      );
      widthAnimationRef.current = animation;
      animation.onfinish = () => {
        lastWidthRef.current = nextWidth;
        widthAnimationRef.current = null;
      };
    } else {
      lastWidthRef.current = nextWidth;
    }

    previousModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (widthAnimationRef.current?.playState === "running") return;
      lastWidthRef.current =
        Math.ceil(content.getBoundingClientRect().width) + 8;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      widthAnimationRef.current?.cancel();
    };
  }, []);

  const run = useCallback(
    (instruction: string, current: Selection | null) => {
      const target = current ?? selection;
      if (!instruction.trim() || !target) return;
      const requestId = ++requestIdRef.current;
      setAction(instruction);
      setExpanded(false);
      setRewritten("");
      setMode("thinking");
      void (async () => {
        try {
          const response = await fetch(`/api/cases/${caseId}/rewrite`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              selection: target.value,
              instruction,
              response: text,
              topic,
              truthMode,
              account,
            }),
          });
          if (!response.ok) {
            if (requestIdRef.current === requestId) reset();
            return;
          }
          const data = (await response.json()) as { rewritten?: unknown };
          if (typeof data.rewritten !== "string" || data.rewritten.length === 0) {
            if (requestIdRef.current === requestId) reset();
            return;
          }
          if (requestIdRef.current !== requestId) return;
          setRewritten(data.rewritten);
          setMode("streaming");
        } catch {
          if (requestIdRef.current === requestId) reset();
        }
      })();
    },
    [caseId, text, selection, reset, topic, truthMode, account],
  );

  const busy = mode === "thinking" || mode === "streaming";
  const visible = selection !== null && positioned;
  const hasPrompt = prompt.trim().length > 0;
  const busyLabel = busyLabelFor(action);

  return (
    <div data-component="draft-selection-actions" data-mode={mode} ref={hostRef} className="relative rounded-control bg-inset px-3 py-2.5">
      <p
        ref={textRef}
        data-field="reply-text"
        onMouseUp={handleSelection}
        onMouseDown={() => {
          if (mode === "idle") {
            setSelection(null);
            setPositioned(false);
          }
        }}
        className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2"
      >
        {selection ? (
          <>
            {text.slice(0, selection.index)}
            <span
              ref={selectionRef}
              data-field="selection"
              className="box-decoration-clone rounded-[3px] bg-accent-tint text-ink"
            >
              {mode === "streaming" ? (
                <StreamText
                  text={rewritten}
                  onProgress={place}
                  onDone={() => setMode("result")}
                />
              ) : mode === "result" ? (
                rewritten
              ) : (
                selection.value
              )}
            </span>
            {text.slice(selection.index + selection.value.length)}
          </>
        ) : (
          text
        )}
      </p>

      {selection !== null && enabled ? (
        <div
          data-field="selection-bar"
          className="absolute top-0 left-0 z-10"
          style={{
            transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0) translateX(-50%)`,
            transition:
              "transform 320ms cubic-bezier(0.77,0,0.175,1), opacity 180ms ease-out",
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? "auto" : "none",
            willChange: "transform",
          }}
        >
          {/* A 36px pill wraps 28px controls at a 4px inset. The controls
              resolve to a 14px radius, preserving the concentric curve. */}
          <div
            ref={barRef}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-9 w-fit max-w-[calc(100vw-48px)] items-center justify-center gap-0.5 overflow-hidden rounded-full bg-surface p-1 font-sans font-normal text-ink shadow-overlay"
            style={{
              width:
                mode === "idle" && hasPrompt && typingWidth
                  ? typingWidth
                  : undefined,
              ...(visible
                ? {
                    animation:
                      "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both",
                  }
                : {}),
            }}
          >
            <div
              ref={contentRef}
              className="flex w-fit shrink-0 items-center justify-center gap-0.5"
              style={{
                width:
                  mode === "idle" && hasPrompt && typingWidth
                    ? typingWidth - 8
                    : undefined,
              }}
            >
              {busy && (
                <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-normal text-ink-2">
                  <span
                    className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                    style={{ animation: "spin 700ms linear infinite" }}
                  />
                  {mode === "thinking" ? (
                    <Shimmer className="text-[12.5px] font-normal">
                      {busyLabel}…
                    </Shimmer>
                  ) : (
                    <span>{busyLabel}…</span>
                  )}
                </span>
              )}

              {mode === "result" && (
                <>
                  <button
                    type="button"
                    data-action="rewrite-keep"
                    onClick={() => {
                      const applied = text.replace(selection.value, rewritten);
                      reset();
                      onApply(applied);
                    }}
                    className={primary}
                  >
                    {icons.check}
                    Keep
                  </button>
                  <button
                    type="button"
                    data-action="rewrite-discard"
                    onClick={reset}
                    className={control}
                  >
                    {icons.close}
                    Discard
                  </button>
                  <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                  <button
                    type="button"
                    data-action="rewrite-retry"
                    aria-label="Try again"
                    onClick={() => run(action, selection)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink-2 active:scale-[0.96]"
                  >
                    {icons.retry}
                  </button>
                </>
              )}

              {mode === "idle" && (
                <>
                  <div
                    className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: expanded
                        ? 0
                        : hasPrompt && typingWidth
                          ? typingWidth - 40
                          : 145,
                      opacity: expanded ? 0 : 1,
                      transform: expanded ? "translateX(-8px)" : "translateX(0)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    <form
                      className="flex h-7 shrink-0 items-center transition-[width] duration-400"
                      style={{
                        width:
                          hasPrompt && typingWidth ? typingWidth - 40 : 145,
                        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                      }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(prompt.trim() || "Improve", selection);
                      }}
                    >
                      <input
                        value={prompt}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (!prompt.trim() && next.trim()) {
                            setTypingWidth(
                              Math.ceil(
                                barRef.current?.getBoundingClientRect().width ??
                                  0,
                              ),
                            );
                          } else if (!next.trim()) {
                            setTypingWidth(null);
                          }
                          setPrompt(next);
                        }}
                        aria-label="Describe edits"
                        placeholder="Describe edits"
                        className="h-7 w-full bg-transparent pr-2.5 pl-3 text-[12.5px] text-ink placeholder:text-ink-3"
                      />
                    </form>
                  </div>

                  <div
                    className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: hasPrompt ? 0 : expanded ? 462 : 224,
                      opacity: hasPrompt ? 0 : 1,
                      transform: hasPrompt ? "translateX(-8px)" : "translateX(0)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    {!expanded && (
                      <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
                    )}
                    <button
                      type="button"
                      data-action="rewrite-explain"
                      onClick={() => run("Explain", selection)}
                      className={control}
                    >
                      {icons.explain}
                      Explain
                    </button>
                    <button
                      type="button"
                      data-action="rewrite-improve"
                      onClick={() => run("Improve", selection)}
                      className={control}
                    >
                      {icons.improve}
                      Improve
                    </button>

                    <div
                      className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,margin] duration-400"
                      style={{
                        maxWidth: expanded ? 262 : 0,
                        opacity: expanded ? 1 : 0,
                        marginLeft: expanded ? 2 : 0,
                        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                      }}
                    >
                      <button
                        type="button"
                        data-action="rewrite-shorten"
                        onClick={() => run("Shorten", selection)}
                        className={control}
                      >
                        {icons.shorten}
                        Shorten
                      </button>
                      <button
                        type="button"
                        data-action="rewrite-tone"
                        onClick={() => run("Change tone", selection)}
                        className={control}
                      >
                        {icons.tone}
                        Tone
                      </button>
                      <button
                        type="button"
                        data-action="rewrite-grammar"
                        onClick={() => run("Fix grammar", selection)}
                        className={control}
                      >
                        {icons.grammar}
                        Grammar
                      </button>
                    </div>

                    <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                    <button
                      type="button"
                      aria-label={expanded ? "Show fewer actions" : "Show more actions"}
                      aria-expanded={expanded}
                      onClick={() => setExpanded((value) => !value)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-200 hover:bg-hover active:scale-[0.96]"
                    >
                      <span
                        className="flex transition-transform duration-400"
                        style={{
                          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                          transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                        }}
                      >
                        {icons.chevron}
                      </span>
                    </button>
                  </div>

                  <div
                    className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: hasPrompt ? 30 : 0,
                      opacity: hasPrompt ? 1 : 0,
                      transform: hasPrompt ? "scale(1)" : "scale(0.88)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    <button
                      type="button"
                      data-action="rewrite-send"
                      aria-label="Send edit instruction"
                      onClick={() => run(prompt.trim(), selection)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-[opacity,transform] duration-200 active:scale-[0.94]"
                    >
                      {icons.send}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
