"use client";

import React, { useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export type DisclosureCardProps = {
  title: string;
  summary?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
};

export function DisclosureCard({
  title,
  summary,
  badge,
  defaultOpen = false,
  forceOpen = false,
  children,
}: DisclosureCardProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <section
      data-component="disclosure-card"
      data-open={open ? "true" : "false"}
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-start outline-none transition-colors duration-150 ease-out hover:bg-inset/40 focus-visible:ring-[3px] focus-visible:ring-ring">
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-ink-3 transition-transform duration-150 ease-out",
              open && "rotate-180",
            )}
          />
          <h2 className="m-0 font-display text-[14px] font-semibold text-ink">{title}</h2>
          {badge}
          {summary ? (
            <span className="ms-auto min-w-0 truncate ps-2 text-[12px] font-normal text-ink-3">
              {summary}
            </span>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent keepMounted>
          <div className="border-t border-line p-4">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
