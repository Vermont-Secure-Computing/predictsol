import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { fetchPoolOhlcv } from "../utils/fetchOhlcv";

function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleString();
}

function mergeByTime(trueCandles, falseCandles) {
  const map = new Map();

  for (const c of trueCandles) {
    map.set(c.t, { t: c.t, trueClose: c.c });
  }
  for (const c of falseCandles) {
    const prev = map.get(c.t) || { t: c.t };
    prev.falseClose = c.c;
    map.set(c.t, prev);
  }

  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

export default function TruthOhlcvChart({
  truePoolAddress,
  falsePoolAddress,
  timeframe = "minute",
  aggregate = 5,
  limit = 200,
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [trueCandles, setTrueCandles] = useState([]);
  const [falseCandles, setFalseCandles] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setErr("");
        setLoading(true);

        const [t, f] = await Promise.all([
          fetchPoolOhlcv({
            poolAddress: truePoolAddress,
            timeframe,
            aggregate,
            limit,
            currency: "token",
            tokenSide: "base",
          }),
          fetchPoolOhlcv({
            poolAddress: falsePoolAddress,
            timeframe,
            aggregate,
            limit,
            currency: "token",
            tokenSide: "base",
          }),
        ]);

        if (cancelled) return;
        setTrueCandles(t);
        setFalseCandles(f);
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (truePoolAddress && falsePoolAddress) run();
    return () => {
      cancelled = true;
    };
  }, [truePoolAddress, falsePoolAddress, timeframe, aggregate, limit]);

  const data = useMemo(
    () => mergeByTime(trueCandles, falseCandles),
    [trueCandles, falseCandles]
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="mb-2 text-sm font-semibold">TRUE vs FALSE Price (Close, USD)</div>

      {loading && <div className="text-xs opacity-80">Loading OHLCV…</div>}
      {err && <div className="text-xs text-red-600">{err}</div>}

      {!loading && !err && data.length === 0 && (
        <div className="text-xs opacity-80">No chart data yet.</div>
      )}

      {!loading && !err && data.length > 0 && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                minTickGap={30}
              />
              <YAxis />
              <Tooltip labelFormatter={(v) => fmtTime(v)} />
              <Legend />
              <Line type="monotone" dataKey="trueClose" dot={false} name="TRUE" stroke="#06a022ff"/>
              <Line type="monotone" dataKey="falseClose" dot={false} name="FALSE" stroke="#931c05ff"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 text-[11px] opacity-70">
        Source: pool OHLCV (CoinGecko on-chain / GeckoTerminal).
      </div>
    </div>
  );
}
