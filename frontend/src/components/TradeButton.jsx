import React from "react";
import { useBestPools } from "../hooks/dexFetcher";
import TruthOhlcvChart from "./OHLCVchart";

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

  if (!show) return null;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Trade on {dexName}</div>
        {loading ? (
          <div className="text-xs opacity-70">Checking pools…</div>
        ) : err ? (
          <div className="text-xs text-rose-600 dark:text-rose-300">Pool check error</div>
        ) : (
          <div className="text-xs opacity-70">
            {truePool ? `TRUE LP: $${(truePool?.liquidity?.usd ?? 0).toFixed(1)}` : "TRUE: no pool"} ·{" "}
            {falsePool ? `FALSE LP: $${(falsePool?.liquidity?.usd ?? 0).toFixed(1)}` : "FALSE: no pool"}
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
        truePoolAddress={truePool.pairAddress}
        falsePoolAddress={falsePool.pairAddress}
        timeframe="minute"
        aggregate={5}
        limit={200}
      />} */}
    </div>
  );
}
