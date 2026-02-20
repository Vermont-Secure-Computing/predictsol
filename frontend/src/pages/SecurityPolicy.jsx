import React from "react";
import { FaCheckCircle } from "react-icons/fa";
import { getConstants } from "../constants";

export default function SecurityPolicy() {
  const constants = getConstants();

  return (
    <section className="max-w-5xl mx-auto px-4 py-10 md:py-14">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Security Policy – PredictSol
        </h1>
        <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-gray-300">
          PredictSol is a decentralized prediction market protocol on Solana. We
          focus on transparent on-chain rules, verifiable program IDs, and
          community-driven resolution via the Truth Network.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
        <div className="p-5 md:p-7">
          {/* Smart Contract Overview */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              Smart Contract Overview
            </h2>

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              <FaCheckCircle className="text-sm" />
              Verified on Solana Explorer
            </span>
          </div>

          <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Program ID
              </div>

              <a
                href={`https://explorer.solana.com/address/${constants.PREDICTSOL_PROGRAM_ID.toBase58()}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all font-mono text-sm text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {constants.PREDICTSOL_PROGRAM_ID.toBase58()}
              </a>
            </div>

            <div className="flex flex-col gap-1">
              <div>
                <span className="font-semibold text-gray-900 dark:text-white">
                  Source code:
                </span>{" "}
                <a
                  className="text-indigo-600 hover:underline dark:text-indigo-300"
                  href="https://github.com/Vermont-Secure-Computing/predictsol"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Repository
                </a>
              </div>

              <div className="text-gray-600 dark:text-gray-300">
                Security contact metadata is embedded using{" "}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-900 dark:bg-gray-900 dark:text-gray-200">
                  solana-security-txt
                </code>
                .
              </div>
            </div>
          </div>

          <div className="my-7 h-px bg-gray-200 dark:bg-gray-800" />

          {/* Key Security Features */}
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Key Security Features
          </h2>

          <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">

            <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                <strong className="text-gray-900 dark:text-white">
                    Clear phase rules
                </strong>{" "}
                Every event follows strict on-chain time phases 
                (<code>bet_end_time</code>, <code>commit_end_time</code>, <code>reveal_end_time</code>). 
                State changes are controlled by these timestamps and flags like{" "}
                <code>resolved</code> and <code>unclaimed_swept</code>.
                </span>
            </li>

            <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                <strong className="text-gray-900 dark:text-white">
                    Event-to-question linking
                </strong>{" "}
                Each PredictSol event is permanently tied to a specific Truth Network 
                question and vault, preventing mismatches or fund redirection.
                </span>
            </li>

            <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                <strong className="text-gray-900 dark:text-white">
                    Commission tracking
                </strong>{" "}
                House and creator commissions are tracked on-chain and can only be 
                claimed once. This prevents double withdrawals.
                </span>
            </li>

            <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                <strong className="text-gray-900 dark:text-white">
                    Burn before payout
                </strong>{" "}
                Tokens must be burned before SOL is released. Vault balances are 
                checked against rent requirements to prevent unsafe transfers.
                </span>
            </li>

            </ul>



          <div className="my-7 h-px bg-gray-200 dark:bg-gray-800" />

          {/* Risks and Considerations */}
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Risks and Considerations
          </h2>

          <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>
                PredictSol depends on the external{" "}
                <strong className="text-gray-900 dark:text-white">
                  Truth Network
                </strong>
                . Manipulation attempts on voting outcomes could affect fairness
                in some scenarios.
              </span>
            </li>

            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>
                Users are responsible for verifying the official PredictSol{" "}
                <strong className="text-gray-900 dark:text-white">
                  program ID
                </strong>{" "}
                before interacting.
              </span>
            </li>
          </ul>

          <div className="my-7 h-px bg-gray-200 dark:bg-gray-800" />

          {/* Bug Bounty & Disclosure */}
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Bug Reports & Responsible Disclosure
          </h2>

          <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
            If you discover a vulnerability in the PredictSol smart contract or
            frontend, please disclose it responsibly. We appreciate detailed
            reproduction steps and impact analysis.
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Contact
            </div>
            <a
              href="mailto:office@vtscc.org"
              className="mt-1 inline-block text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              office@vtscc.org
            </a>
          </div>

          <div className="my-7 h-px bg-gray-200 dark:bg-gray-800" />

          {/* Security Audit */}
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Security Review
          </h2>

          <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
            An internal review has been performed by{" "}
            <strong className="text-gray-900 dark:text-white">
              Vermont Secure Computing Consultancy (VTSCC)
            </strong>
            . We recommend that advanced users verify the deployed program
            binary against the public source using{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-900 dark:bg-gray-900 dark:text-gray-200">
              solana-verify
            </code>
            .
          </p>

          {/* Footer note */}
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-200">
            <span className="font-semibold">Note:</span> This policy is a living
            document and may be updated as PredictSol evolves.
          </div>
        </div>
      </div>
    </section>
  );
}
