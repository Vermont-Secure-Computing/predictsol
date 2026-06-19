import React, { useEffect, useState } from "react";

const DISCLAIMER_KEY = "predictsol_disclaimer_accepted";

export default function DisclaimerModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(DISCLAIMER_KEY);
    if (!accepted) setShow(true);
  }, []);

  function accept() {
    localStorage.setItem(DISCLAIMER_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl dark:bg-amber-900/30">
            ⚠
          </div>

          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              PREDICTSOL - UNFILTERED ACCESS
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              This is a permissionless, serverless interface to a public Solana program.
              There is no backend, no admin keys, and no ability to censor, reverse, or
              modify any transaction once submitted.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            By continuing, you agree that:
          </div>

          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
              <span>All on-chain content is the sole responsibility of its originator.</span>
            </li>

            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
              <span>We are not liable for any content, losses, or smart contract exploits.</span>
            </li>

            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
              <span>You assume 100% of the risk associated with interacting with this contract.</span>
            </li>
          </ul>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={accept}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 active:scale-[0.98]"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}