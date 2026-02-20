import React, { useState, useMemo } from "react";
import { useBestPools } from "../hooks/dexFetcher";
import TruthOhlcvChart from "./OHLCVchart";
import { FaChevronDown, FaChevronUp, FaExclamation } from "react-icons/fa";

const WSOL = "So11111111111111111111111111111111111111112";

function raydiumSwapUrl({ outputMint, inputMint = "sol" }) {
  return `https://raydium.io/swap/?outputMint=${outputMint}&inputMint=${inputMint}`;
}

export function TradeButtons({ ev }) {

  console.log("TRADE BUTTONS")
  const trueMint = ev?.trueMint?.toBase58?.();
  const falseMint = ev?.falseMint?.toBase58?.();

  const { loading, err, truePool, falsePool } = useBestPools({ trueMint, falseMint });

  const show = !!truePool || !!falsePool;
  const dexName = truePool?.dexId || falsePool?.dexId || "DEX";

  const [showDexNote, setShowDexNote ] = useState(false);

  const bettingClosed = useMemo(() => {
    if (!ev.betEndTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= Number(ev.betEndTime);
  }, [ev?.betEndTime]);

  const eventLocked = ev?.resolved || bettingClosed;

  if (!show) return null;

  const hasTrue = !!truePool?.pairAddress;
  const hasFalse = !!falsePool?.pairAddress;
  const hasBoth = hasTrue && hasFalse;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Trade on {dexName}</div>
        {loading ? (
          <div className="text-xs opacity-70">Checking pools…</div>
        ) : err ? (
          <div className="text-xs text-rose-600 dark:text-rose-300">Pool check error</div>
        ) : (
          <div className="flex flex-col items-end text-xs opacity-80 leading-tight">
            
            <div className="flex gap-3 text-xs font-medium">
              {truePool?.priceNative && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  TRUE {Number(truePool.priceNative).toFixed(4)} SOL
                </span>
              )}
              {falsePool?.priceNative && (
                <span className="text-rose-600 dark:text-rose-400">
                  FALSE {Number(falsePool.priceNative).toFixed(4)} SOL
                </span>
              )}
            </div>

            <div className="text-xs opacity-70">
              {truePool ? `TRUE LP: $${(truePool?.liquidity?.usd ?? 0).toFixed(1)}` : "TRUE: no pool"} ·{" "}
              {falsePool ? `FALSE LP: $${(falsePool?.liquidity?.usd ?? 0).toFixed(1)}` : "FALSE: no pool"}
            </div>

          </div>
        )}
      </div>

      <div className="mb-2">
        <button
          type="button"
          onClick={() => setShowDexNote(v => !v)}
          className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-[11px] dark:border-gray-700 dark:bg-gray-900">
            <FaExclamation />
          </span>

          <span>DEX warnings</span>

          {showDexNote ? (
            <FaChevronUp className="h-4 w-4 opacity-70" />
          ) : (
            <FaChevronDown className="h-4 w-4 opacity-70" />
          )}
        </button>

        {showDexNote && (
          <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-200">
            <div className="space-y-1.5">
              <div className="font-semibold">
                Why DEX shows “This token is mintable”
              </div>

              <div className="opacity-90">
                TRUE/FALSE shares are minted by a program-controlled PDA while the event is active,
                so users can buy positions. This is expected for prediction share tokens.
              </div>

              <div className="opacity-90">
                <span className="font-semibold">Minting status:</span>{" "}
                {eventLocked ? (
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    minting disabled for this event
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    minting allowed only during betting window
                  </span>
                )}
              </div>
              {/* 
              <div className="pt-1 opacity-80">
                DEX scanners only check mint authority flags — they don’t see your
                program’s time-based minting restrictions.
              </div> */}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 p-1">
        {truePool && trueMint && (
          <a
            href={raydiumSwapUrl({ outputMint: trueMint, inputMint: "sol" })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white hover:text-white font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-500/20 uppercase tracking-wider text-sm"
          >
            <span className="opacity-70 text-xs">BUY TRUE</span>
          </a>
        )}

        {falsePool && falseMint && (
          <a
            href={raydiumSwapUrl({ outputMint: falseMint, inputMint: "sol" })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white hover:text-white font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-rose-500/20 uppercase tracking-wider text-sm"
          >
            <span className="opacity-70 text-xs">BUY FALSE</span>
          </a>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {truePool?.url && (
          <a className="text-indigo-600 hover:underline dark:text-indigo-300" href={truePool.url} target="_blank" rel="noreferrer">
            View TRUE pool
          </a>
        )}
        {falsePool?.url && (
          <a className="text-indigo-600 hover:underline dark:text-indigo-300" href={falsePool.url} target="_blank" rel="noreferrer">
            View FALSE pool
          </a>
        )}
      </div>

      {/* {truePool && <TruthOhlcvChart
        truePoolAddress={truePool?.pairAddress}
        falsePoolAddress={falsePool?.pairAddress}
        timeframe="minute"
        aggregate={5}
        limit={200}
      />} */}

      {/* Charts */}
      <div
        className={[
          "mt-3 grid gap-3",
          hasBoth ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        ].join(" ")}
      >
        {/* TRUE */}
        {hasTrue && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/40">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200">
              <span>TRUE chart</span>
              {truePool?.priceNative && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {Number(truePool.priceNative).toFixed(4)} SOL
                </span>
              )}
            </div>

            <iframe
              title="GeckoTerminal TRUE"
              src={`https://www.geckoterminal.com/solana/pools/${truePool.pairAddress}?embed=1&info=0&swaps=0&light_chart=0&chart_type=price&resolution=1d&bg_color=f1f5f9`}
              frameBorder={0}
              allow="clipboard-write"
              allowFullScreen={false}
              className={[
                "block w-full",
                hasBoth ? "h-[340px] md:h-[400px]" : "h-[420px] md:h-[520px]",
                "bg-white dark:bg-gray-950",
              ].join(" ")}
            />
          </div>
        )}

        {/* FALSE */}
        {hasFalse && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/40">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200">
              <span>FALSE chart</span>
              {falsePool?.priceNative && (
                <span className="text-rose-600 dark:text-rose-400">
                  {Number(falsePool.priceNative).toFixed(4)} SOL
                </span>
              )}
            </div>

            <iframe
              title="GeckoTerminal FALSE"
              src={`https://www.geckoterminal.com/solana/pools/${falsePool.pairAddress}?embed=1&info=0&swaps=0&light_chart=0&chart_type=price&resolution=1d&bg_color=f1f5f9`}
              frameBorder={0}
              allow="clipboard-write"
              allowFullScreen={false}
              className={[
                "block w-full",
                hasBoth ? "h-[340px] md:h-[400px]" : "h-[420px] md:h-[520px]",
                "bg-white dark:bg-gray-950",
              ].join(" ")}
            />
          </div>
        )}
      </div>


    </div>
  );
}
