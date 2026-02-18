import React from "react";

export default function TxHint({ children, className = "" }) {
  return (
    <div
      className={
        "mt-1 inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full " +
        "border border-gray-200 bg-gray-50 text-gray-600 " +
        "dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300 " +
        className
      }
    >
      {children}
    </div>
  );
}
