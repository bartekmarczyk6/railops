"use client";

import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  const cls = [
    "w-full border-collapse text-sm",
    className ?? "",
  ].join(" ").trim();
  return (
    <table className={cls} {...rest}>
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-[color:var(--surface-sunken)] text-left">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  const cls = [
    "border-t border-[color:var(--border)]",
    className ?? "",
  ].join(" ").trim();
  return (
    <tr className={cls} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  const cls = [
    "px-3 py-2 font-bold text-[color:var(--text)]",
    className ?? "",
  ].join(" ").trim();
  return (
    <th scope="col" className={cls} {...rest}>
      {children}
    </th>
  );
}

export function TD({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  const cls = [
    "px-3 py-2 align-top text-[color:var(--text)]",
    className ?? "",
  ].join(" ").trim();
  return (
    <td className={cls} {...rest}>
      {children}
    </td>
  );
}
