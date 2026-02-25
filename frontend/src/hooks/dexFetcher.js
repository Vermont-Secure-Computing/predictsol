import { useEffect, useState } from "react";
import {
  fetchDexscreenerPairsSolana,
  pickBestSolPool,
  getPoolsByMint,
  getPoolsFromGecko,
} from "../utils/getPools";

const HELIUS_RPC =
  "https://mainnet.helius-rpc.com/?api-key=53dd1693-43cc-4545-880e-74fa732ab766";

// ---- helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeDexscreenerPair(pair) {
  if (!pair) return null;
  return {
    source: "dexscreener",
    dexId: pair.dexId || null,
    labels: pair.labels || [],
    pairAddress: pair.pairAddress || null,
    url: pair.url || null,
    priceNative: pair.priceNative ?? null, // string
    priceUsd: pair.priceUsd ?? null,
    liquidity: pair.liquidity || { usd: 0 },
    baseToken: pair.baseToken,
    quoteToken: pair.quoteToken,
  };
}


function normalizeGeckoPool(p) {
  if (!p) return null;

  return {
    source: "gecko",
    dexId: p.dex || "gecko",
    labels: [],
    pairAddress: p.poolAddress || null,
    url: p.poolAddress
      ? `https://www.geckoterminal.com/solana/pools/${p.poolAddress}`
      : null,

    priceNative: p.priceNative ?? null,
    priceUsd: p.priceUsd ?? null,

    liquidity: { usd: Number(p.reserveUsd || 0) },

    baseToken: null,
    quoteToken: null,
    _raw: p,
  };
}

function normalizeWeb3Pool(p) {
  if (!p) return null;

  const addr =
    typeof p === "string"
      ? p
      : p.poolAddress || p.address || p.pairAddress || null;

  const usd =
    typeof p === "object" && p !== null
      ? Number(p.liquidityUsd || p.reserveUsd || p.usd || 0)
      : 0;

  return {
    source: "web3",
    dexId: p.dexId || p.dex || "web3",
    labels: [],
    pairAddress: addr,
    url: addr ? `https://www.geckoterminal.com/solana/pools/${addr}` : null,
    priceNative: p.priceNative ?? null,
    priceUsd: p.priceUsd ?? null,
    liquidity: { usd },
    _raw: p,
  };
}


function pickBestNormalizedPool(pools) {
  const list = (pools || []).filter(Boolean);
  if (!list.length) return null;

  list.sort((a, b) => {
    const la = Number(a?.liquidity?.usd || 0);
    const lb = Number(b?.liquidity?.usd || 0);

    if (lb !== la) return lb - la;

    // tie-breaker: prefer the one with priceNative
    const pa = a?.priceNative ? 1 : 0;
    const pb = b?.priceNative ? 1 : 0;
    return pb - pa;
  });

  return list[0];
}


async function resolveBestPoolRoundRobin({ mint, rpcUrl = HELIUS_RPC, maxRounds = 2 }) {
  if (!mint) return null;

  const sources = [
    async () => {
      const pairs = await fetchDexscreenerPairsSolana(mint);
      const best = pickBestSolPool(pairs);
      return best ? normalizeDexscreenerPair(best) : null;
    },
    async () => {
      const pools = await getPoolsByMint(mint, rpcUrl);
      const arr = Array.isArray(pools) ? pools : pools ? [pools] : [];
      const normalized = arr.map(normalizeWeb3Pool).filter(Boolean);
      return pickBestNormalizedPool(normalized);
    },
    async () => {
      const pools = await getPoolsFromGecko(mint);
      const arr = Array.isArray(pools) ? pools : pools ? [pools] : [];
      const normalized = arr.map(normalizeGeckoPool).filter(Boolean);
      return pickBestNormalizedPool(normalized);
    },
  ];

  let lastErr = null;

  for (let round = 0; round < maxRounds; round++) {
    for (let i = 0; i < sources.length; i++) {
      try {
        const res = await sources[i]();
        if (res?.pairAddress) return res;
      } catch (e) {
        lastErr = e;
        // continue to next source
      }
      // small delay between sources to avoid rate limits
      await sleep(150 + round * 150);
    }
  }

  // If nothing found, return null
  return null;
}

export function useBestPools({ trueMint, falseMint }) {
  const [state, setState] = useState({
    loading: true,
    err: "",
    truePool: null,
    falsePool: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setState((s) => ({ ...s, loading: true, err: "" }));

        const [truePool, falsePool] = await Promise.all([
          resolveBestPoolRoundRobin({ mint: trueMint, maxRounds: 3 }),
          resolveBestPoolRoundRobin({ mint: falseMint, maxRounds: 3 }),
        ]);

        if (!cancelled) {
          setState({
            loading: false,
            err: "",
            truePool,
            falsePool,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false,
            err: e?.message || String(e),
            truePool: null,
            falsePool: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trueMint, falseMint]);

  return state;
}