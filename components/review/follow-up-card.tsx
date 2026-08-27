"use client";

import React from "react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/beui/atoms/Button.tsx";
import type { DemoCasePackage } from "@/lib/domain/types.ts";
import { humanize } from "./formatters.ts";

/* ─────────────────────────────────────────────────────────
  * FOLLOW-UP CARD (human-in-the-loop)
  * One question at a time, adapted from the beui ApprovalCard
  * mechanics: the stack slides vertically as you move between
  * questions (the card's height animates to fit), the step
  * counter rolls like an odometer, and the footer uses pill
  * actions — a quiet Skip and a dark Continue. Single-choice
  * answers auto-advance; multi-select waits.
  * ───────────────────────────────────────────────────────── */

export type FollowUpQuestion = {
  id: string;
  q: string;
  type: "radio" | "check";
  options: string[];
};

export type FollowUpCardProps = {
  questions: FollowUpQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  busy?: boolean;
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/* odometer digits — each character that changes rolls up (or down) */
function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) {
          return <span key={`${i}-${n}`}>{n}</span>;
        }
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        const restY = dir === "down" ? "0" : "-1em";
        const startY = dir === "down" ? "-1em" : "0";
        return (
          <span
            key={`${i}-${o}-${n}-${dir}`}
            style={{ display: "inline-block", position: "relative", overflow: "hidden", height: "1em", lineHeight: "1em", verticalAlign: "-0.05em" }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: `translateY(${shifted ? restY : startY})`,
              }}
            >
              <span style={{ height: "1em", lineHeight: "1em" }}>{top}</span>
              <span style={{ height: "1em", lineHeight: "1em" }}>{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

export function buildFollowUpAnswers(
  questions: readonly FollowUpQuestion[],
  picked: Record<number, number[]>,
  custom: Record<number, string>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((question, qi) => {
    const selected = (picked[qi] ?? [])
      .map((index) => question.options[index])
      .filter((option): option is string => typeof option === "string" && option.length > 0);
    const customText = (custom[qi] ?? "").trim();
    const value =
      question.type === "check"
        ? [...selected, ...(customText ? [customText] : [])].join(", ")
        : customText || (selected[0] ?? "");
    if (value.length > 0) answers[question.id] = value;
  });
  return answers;
}

export function buildFollowUpQuestions(
  missingFields: readonly string[],
  pkg: DemoCasePackage,
): FollowUpQuestion[] {
  return missingFields
    .filter((field) => field.trim().length > 0)
    .map((field) => {
      const lower = field.toLowerCase();
      let options: string[] = [];
      if (lower.includes("ticket")) {
        options = pkg.tickets.map((t) => t.id);
      } else if (
        lower.includes("station") ||
        lower.includes("origin") ||
        lower.includes("destination")
      ) {
        options = [pkg.route.origin, pkg.route.destination].filter((s) => s.length > 0);
      }
      return {
        id: field,
        q: `Can you confirm the ${humanize(field).toLowerCase()}?`,
        type: "radio" as const,
        options,
      };
    });
}

export function FollowUpCard({
  questions,
  onSubmit,
  busy = false,
}: FollowUpCardProps): React.JSX.Element | null {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measured = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const customRef = useRef(custom);
  customRef.current = custom;
  const [viewportH, setViewportH] = useState<number | undefined>(undefined);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);

  const count = questions.length;
  const last = qi >= count - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());

  const sync = (withAnim: boolean) => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };

  useIsoLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, answers, custom]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  if (count === 0) return null;

  const goTo = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), count - 1));
  };

  const send = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    onSubmit(buildFollowUpAnswers(questions, answersRef.current, customRef.current));
  };

  const advance = () => {
    if (last) send();
    else goTo(qi + 1);
  };

  const toggle = (index: number) => {
    const type = questions[qi]?.type ?? "radio";
    setAnswers((current) => {
      const picked = current[qi] ?? [];
      const next = type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];
      return { ...current, [qi]: next };
    });
    if (type === "radio") {
      setCustom((current) => ({ ...current, [qi]: "" }));
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        if (last) send();
        else setQi((current) => Math.min(count - 1, current + 1));
      }, 480);
    }
  };

  return (
    <section
      data-component="follow-up-card"
      aria-label="The agent needs a hand"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">
          The agent needs a hand
        </h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-ink-3">
          Some details are missing from the claim — answer what you can and the agent picks the case back up.
        </p>
      </div>
      <div className="p-4">
        <div
          className="overflow-hidden"
          style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
          aria-live="polite"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 26,
              transform: `translate3d(0, ${-trackY}px, 0)`,
              transition: animate ? `transform ${SLIDE}` : undefined,
              willChange: "transform",
            }}
          >
            {questions.map((question, qIdx) => {
              const active = qIdx === qi;
              const picked = answers[qIdx] ?? [];
              const questionStyle: CSSProperties = {
                opacity: active ? 1 : 0,
                transition: animate ? `opacity ${SLIDE}` : undefined,
                pointerEvents: active ? undefined : "none",
              };
              return (
                <div
                  key={question.id}
                  ref={(el) => { questionRefs.current[qIdx] = el; }}
                  aria-hidden={active ? undefined : true}
                  style={questionStyle}
                >
                  <div data-field="question" className="text-[14px] font-medium text-ink">{question.q}</div>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {question.options.map((option, i) => {
                      const on = picked.includes(i);
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={on}
                          tabIndex={active ? 0 : -1}
                          onClick={() => { if (active) toggle(i); }}
                          className="flex items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-100 hover:bg-hover"
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200
                              ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"}
                              ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}
                          >
                            {question.type === "radio" ? (
                              <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            )}
                          </span>
                          <span className={`text-[13px] transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>
                            {option}
                          </span>
                        </button>
                      );
                    })}
                    <label className="flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 focus-within:bg-hover hover:bg-hover">
                      <span aria-hidden="true" className="size-4 shrink-0" />
                      <input
                        value={custom[qIdx] ?? ""}
                        tabIndex={active ? 0 : -1}
                        onChange={(event) => {
                          if (!active) return;
                          setCustom((current) => ({ ...current, [qIdx]: event.target.value }));
                          if (question.type === "radio") setAnswers((current) => ({ ...current, [qIdx]: [] }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && hasAnswer) {
                            event.preventDefault();
                            advance();
                          }
                        }}
                        placeholder="Something else…"
                        aria-label="Custom answer"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-inset/40 px-4 py-2.5">
        <div className="flex items-center gap-1 text-ink-3">
          <button
            type="button"
            aria-label="Previous question"
            disabled={qi <= 0}
            onClick={() => goTo(qi - 1)}
            className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 15l-6-6-6 6" /></svg>
          </button>
          <span className="inline-flex items-center text-[12px] font-medium tabular-nums text-ink-3" style={{ letterSpacing: "-0.1px", lineHeight: 1 }}>
            <RollingDigits value={`${qi + 1} / ${count}`} />
          </span>
          <button
            type="button"
            aria-label="Next question"
            disabled={last}
            onClick={() => goTo(qi + 1)}
            className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>

        <div className="-mr-0.5 flex items-center gap-1.5">
          <Button variant="ghost" size="sm" data-action="follow-up-skip" disabled={busy} onClick={send}>
            Skip
          </Button>
          <Button variant="accent" size="sm" data-action="follow-up-continue" disabled={!hasAnswer || busy} onClick={advance}>
            {last ? "Send" : "Continue"}
          </Button>
        </div>
      </div>
    </section>
  );
}
