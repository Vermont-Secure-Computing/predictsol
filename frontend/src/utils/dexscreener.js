const DEXSCREENER_BASE = "https://api.dexscreener.com";

export async function fetchDexscreenerPairsSolana(mint) {
  if (!mint) return [];
  const url = `${DEXSCREENER_BASE}/token-pairs/v1/solana/${mint}`;

  const res = await fetch(url);
  console.log("fetch dex token pairs: ", res)
  if (!res.ok) throw new Error(`Dexscreener failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const WSOL = "So11111111111111111111111111111111111111112";

export function pickBestSolPool(pairs, { minLiquidityUsd = 0 } = {}) {
  const solPairs = (pairs || [])
    
    .filter(p => (p?.quoteToken?.address || "") === WSOL)
    .filter(p => !!p?.pairAddress && !!p?.dexId)
    .filter(p => (p?.liquidity?.usd ?? 0) >= minLiquidityUsd)
    .sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0));

  return solPairs[0] || null;
}
