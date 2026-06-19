import { useEffect, useState } from "react";
import {
  fetchDexscreenerPairsSolana,
  pickBestSolPool,
  getPoolsByMint,
  getPoolsFromGecko,
  getRaydiumQuote,
  getRaydiumBaseOutQuote
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

function hasUsablePrice(pool) {
  const native = Number(pool?.priceNative || 0);
  const usd = Number(pool?.priceUsd || 0);
  return native > 0 || usd > 0;
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

  let fallbackPool = null;

  for (let round = 0; round < maxRounds; round++) {
    for (let i = 0; i < sources.length; i++) {
      try {
        const res = await sources[i]();

        console.log("[pool source result]", {
          mint,
          round,
          sourceIndex: i,
          result: res
        });

        if (res?.pairAddress) {
          if (!fallbackPool) fallbackPool = res;

          if (hasUsablePrice(res)) {
            return res;
          }
        }
      } catch (e) {
        console.warn("Pool source failed:", e);
      }

      await sleep(150 + round * 150);
    }
  }

  return fallbackPool;
}

export function useBestPools({ trueMint, falseMint, refreshMs = 0 }) {
  const [state, setState] = useState({
    loading: true,
    err: "",
    truePool: null,
    falsePool: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const load = async (showLoading = false) => {
      try {
        if (showLoading) {
          setState((s) => ({ ...s, loading: true, err: "" }));
        }

        const [truePool, falsePool] = await Promise.all([
          resolveBestPoolRoundRobin({ mint: trueMint, maxRounds: 3 }),
          resolveBestPoolRoundRobin({ mint: falseMint, maxRounds: 3 }),
        ]);

        const [trueQuote, falseQuote] = await Promise.all([
          trueMint ? getRaydiumQuote({ outputMint: trueMint }) : null,
          falseMint ? getRaydiumQuote({ outputMint: falseMint }) : null,
        ]);

        const [trueBaseIn, falseBaseIn, trueBaseOut, falseBaseOut] =
        await Promise.all([
          getRaydiumQuote({ outputMint: trueMint, amountLamports: 10_000_000 }),
          getRaydiumQuote({ outputMint: falseMint, amountLamports: 10_000_000 }),
          getRaydiumBaseOutQuote({ outputMint: trueMint, outputAmount: 1_000_000_000 }),
          getRaydiumBaseOutQuote({ outputMint: falseMint, outputAmount: 1_000_000_000 }),
        ]);

        console.log("[raydium comparison]", {
          trueMint,
          falseMint,

          trueBaseIn,
          falseBaseIn,

          trueBaseOut,
          falseBaseOut,
        });

        if (truePool) {
          truePool.raydiumQuote = trueQuote;
        }

        if (falsePool) {
          falsePool.raydiumQuote = falseQuote;
        }

        console.log("[raydium quotes]", {
          trueMint,
          falseMint,
          trueQuote,
          falseQuote,
        });

        console.log("[best pools]", {
          trueMint,
          falseMint,
          truePool,
          falsePool,
        });

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
          setState((s) => ({
            ...s,
            loading: false,
            err: e?.message || String(e),
          }));
        }
      }
    };

    load(true);

    if (refreshMs > 0) {
      timer = setInterval(() => {
        load(false);
      }, refreshMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [trueMint, falseMint, refreshMs]);

  return state;
}

// import { useEffect, useState } from "react";
// import {
//   fetchDexscreenerPairsSolana,
//   pickBestSolPool,
//   getPoolsByMint,
//   getPoolsFromGecko,
//   getRaydiumQuote,
// } from "../utils/getPools";

// const HELIUS_RPC =
//   "https://mainnet.helius-rpc.com/?api-key=53dd1693-43cc-4545-880e-74fa732ab766";

// const WSOL = "So11111111111111111111111111111111111111112";
// const PRICE_QUOTE_LAMPORTS = 10_000_000; // 0.01 SOL
// const TOKEN_BASE = 1_000_000_000;

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// function normalizeDexscreenerPair(pair) {
//   if (!pair) return null;

//   return {
//     source: "dexscreener",
//     dexId: pair.dexId || null,
//     labels: pair.labels || [],
//     pairAddress: pair.pairAddress || null,
//     url: pair.url || null,
//     priceNative: pair.priceNative ?? null,
//     priceUsd: pair.priceUsd ?? null,
//     liquidity: pair.liquidity || { usd: 0 },
//     baseToken: pair.baseToken,
//     quoteToken: pair.quoteToken,
//   };
// }

// function normalizeGeckoPool(p) {
//   if (!p) return null;

//   return {
//     source: "gecko",
//     dexId: p.dex || "gecko",
//     labels: [],
//     pairAddress: p.poolAddress || null,
//     url: p.poolAddress
//       ? `https://www.geckoterminal.com/solana/pools/${p.poolAddress}`
//       : null,
//     priceNative: p.priceNative ?? null,
//     priceUsd: p.priceUsd ?? null,
//     liquidity: { usd: Number(p.reserveUsd || 0) },
//     baseToken: null,
//     quoteToken: null,
//     _raw: p,
//   };
// }

// function normalizeWeb3Pool(p) {
//   if (!p) return null;

//   const addr =
//     typeof p === "string"
//       ? p
//       : p.poolAddress || p.address || p.pairAddress || null;

//   const usd =
//     typeof p === "object" && p !== null
//       ? Number(p.liquidityUsd || p.reserveUsd || p.usd || 0)
//       : 0;

//   return {
//     source: "web3",
//     dexId: p.dexId || p.dex || "web3",
//     labels: [],
//     pairAddress: addr,
//     url: addr ? `https://www.geckoterminal.com/solana/pools/${addr}` : null,
//     priceNative: p.priceNative ?? null,
//     priceUsd: p.priceUsd ?? null,
//     liquidity: { usd },
//     _raw: p,
//   };
// }

// function pickBestNormalizedPool(pools) {
//   const list = (pools || []).filter(Boolean);
//   if (!list.length) return null;

//   list.sort((a, b) => {
//     const la = Number(a?.liquidity?.usd || 0);
//     const lb = Number(b?.liquidity?.usd || 0);

//     if (lb !== la) return lb - la;

//     const pa = a?.priceNative ? 1 : 0;
//     const pb = b?.priceNative ? 1 : 0;

//     return pb - pa;
//   });

//   return list[0];
// }

// function hasUsablePrice(pool) {
//   return Number(pool?.priceNative || 0) > 0 || Number(pool?.priceUsd || 0) > 0;
// }

// function priceFromQuote(q) {
//   const out = Number(q?.outputAmount || 0);
//   if (!out) return null;

//   const inputSol = PRICE_QUOTE_LAMPORTS / TOKEN_BASE;
//   const outputTokens = out / TOKEN_BASE;

//   if (!outputTokens) return null;

//   return inputSol / outputTokens;
// }

// async function resolveBestPoolRoundRobin({ mint, rpcUrl = HELIUS_RPC, maxRounds = 2 }) {
//   if (!mint) return null;

//   const sources = [
//     async () => {
//       const pairs = await fetchDexscreenerPairsSolana(mint);
//       const best = pickBestSolPool(pairs);
//       return best ? normalizeDexscreenerPair(best) : null;
//     },
//     async () => {
//       const pools = await getPoolsByMint(mint, rpcUrl);
//       const arr = Array.isArray(pools) ? pools : pools ? [pools] : [];
//       return pickBestNormalizedPool(arr.map(normalizeWeb3Pool));
//     },
//     async () => {
//       const pools = await getPoolsFromGecko(mint);
//       const arr = Array.isArray(pools) ? pools : pools ? [pools] : [];
//       return pickBestNormalizedPool(arr.map(normalizeGeckoPool));
//     },
//   ];

//   let fallbackPool = null;

//   for (let round = 0; round < maxRounds; round++) {
//     for (let i = 0; i < sources.length; i++) {
//       try {
//         const pool = await sources[i]();

//         if (pool?.pairAddress) {
//           if (!fallbackPool) fallbackPool = pool;
//           if (hasUsablePrice(pool)) return pool;
//         }
//       } catch (e) {
//         console.warn("Pool source failed:", e);
//       }

//       await sleep(150 + round * 150);
//     }
//   }

//   return fallbackPool;
// }

// export function useBestPools({ trueMint, falseMint }) {
//   const [state, setState] = useState({
//     loading: true,
//     err: "",
//     truePool: null,
//     falsePool: null,
//     truePrice: null,
//     falsePrice: null,
//     truePriceUsd: null,
//     falsePriceUsd: null,
//   });

//   useEffect(() => {
//     let cancelled = false;

//     async function loadPools() {
//       try {
//         setState((s) => ({ ...s, loading: true, err: "" }));

//         const [truePool, falsePool] = await Promise.all([
//           resolveBestPoolRoundRobin({ mint: trueMint, maxRounds: 3 }),
//           resolveBestPoolRoundRobin({ mint: falseMint, maxRounds: 3 }),
//         ]);

//         const [trueQuote, falseQuote] = await Promise.all([
//           trueMint
//             ? getRaydiumQuote({
//                 inputMint: WSOL,
//                 outputMint: trueMint,
//                 amountLamports: PRICE_QUOTE_LAMPORTS,
//               })
//             : null,
//           falseMint
//             ? getRaydiumQuote({
//                 inputMint: WSOL,
//                 outputMint: falseMint,
//                 amountLamports: PRICE_QUOTE_LAMPORTS,
//               })
//             : null,
//         ]);

//         if (truePool) truePool.raydiumQuote = trueQuote;
//         if (falsePool) falsePool.raydiumQuote = falseQuote;

//         const truePrice = priceFromQuote(trueQuote);
//         const falsePrice = priceFromQuote(falseQuote);

//         const truePriceUsd = truePool?.priceUsd ? Number(truePool.priceUsd) : null;
//         const falsePriceUsd = falsePool?.priceUsd ? Number(falsePool.priceUsd) : null;

//         if (!cancelled) {
//           setState({
//             loading: false,
//             err: "",
//             truePool,
//             falsePool,
//             truePrice,
//             falsePrice,
//             truePriceUsd,
//             falsePriceUsd,
//           });
//         }
//       } catch (e) {
//         if (!cancelled) {
//           setState((s) => ({
//             ...s,
//             loading: false,
//             err: e?.message || String(e),
//           }));
//         }
//       }
//     }

//     loadPools();

//     return () => {
//       cancelled = true;
//     };
//   }, [trueMint, falseMint]);

//   return state;
// }