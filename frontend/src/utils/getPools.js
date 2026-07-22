const DEXSCREENER_BASE = "https://api.dexscreener.com";

export async function fetchDexscreenerPairsSolana(mint) {
  if (!mint) return [];

  const url = `${DEXSCREENER_BASE}/token-pairs/v1/solana/${mint}`;
  const res = await fetch(url);
  const data = await res.json();

  console.log("pools from dexscreener full response:", data);

  if (!res.ok) throw new Error(`Dexscreener failed (${res.status})`);

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


import { Connection, PublicKey } from '@solana/web3.js';

const RAYDIUM_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHS4K9uP6eh');

export async function getPoolsByMint(mintAddress, rpcEndpoint) {
    const connection = new Connection(rpcEndpoint, 'confirmed');
    const tokenMint = new PublicKey(mintAddress);
    
    const v4Filters = (offset) => [
        { dataSize: 752 },
        { memcmp: { offset, bytes: tokenMint.toBase58() } }
    ];

    const cpmmFilters = (offset) => [
        { dataSize: 637 },
        { memcmp: { offset, bytes: tokenMint.toBase58() } }
    ];

    const [v4Base, v4Quote, cpmmA, cpmmB] = await Promise.all([
        connection.getProgramAccounts(RAYDIUM_V4, { filters: v4Filters(400) }),
        connection.getProgramAccounts(RAYDIUM_V4, { filters: v4Filters(432) }),
        connection.getProgramAccounts(RAYDIUM_CPMM, { filters: cpmmFilters(168) }),
        connection.getProgramAccounts(RAYDIUM_CPMM, { filters: cpmmFilters(200) })
    ]);

    return [...v4Base, ...v4Quote, ...cpmmA, ...cpmmB].map(p => ({
        poolAddress: p.pubkey.toBase58(),
        programId: p.account.owner.toBase58()
    }));
}


const RAYDIUM_API = "https://transaction-v1.raydium.io";

export async function getRaydiumQuote({
    inputMint = WSOL,
    outputMint,
    amountLamports = 10_000_000,
    slippageBps = 100,
    txVersion = "V0",
}) {
    if (!outputMint) return null;

    const url = new URL(`${RAYDIUM_API}/compute/swap-base-in`);

    url.searchParams.set("inputMint", inputMint);
    url.searchParams.set("outputMint", outputMint);
    url.searchParams.set("amount", String(amountLamports));
    url.searchParams.set("slippageBps", String(slippageBps));
    url.searchParams.set("txVersion", txVersion);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.msg || `Raydium quote failed: ${res.status}`);
    }

    console.log("[raydium quote]", {
        outputMint,
        poolIds: json.data.routePlan?.map(
        r => r.poolId
        ),
        outputAmount: json.data.outputAmount,
        priceImpactPct: json.data.priceImpactPct
    });

    return json.data;
}

export async function getRaydiumBaseOutQuote({
    inputMint = WSOL,
    outputMint,
    outputAmount = 1_000_000_000,
    slippageBps = 100,
    txVersion = "V0",
}) {
    if (!outputMint) return null;

    const url = new URL(`${RAYDIUM_API}/compute/swap-base-out`);

    url.searchParams.set("inputMint", inputMint);
    url.searchParams.set("outputMint", outputMint);
    url.searchParams.set("amount", String(outputAmount));
    url.searchParams.set("slippageBps", String(slippageBps));
    url.searchParams.set("txVersion", txVersion);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.msg || `Raydium base-out quote failed: ${res.status}`);
    }

    console.log("[raydium base-out quote]", {
        outputMint,
        inputAmount: json?.data?.inputAmount,
        outputAmount: json?.data?.outputAmount,
        priceImpactPct: json?.data?.priceImpactPct,
        poolIds: json?.data?.routePlan?.map((r) => r.poolId),
    });

    return json.data;
}

// // Add this to getPools.js
// export async function getRaydiumPrice({
//     inputMint = WSOL,
//     outputMint,
//     amountLamports = 1_000_000_000, // 1 SOL for better precision
// }) {
//     if (!outputMint) return null;

//     try {
//         const quote = await getRaydiumQuote({
//             inputMint,
//             outputMint,
//             amountLamports,
//         });

//         if (!quote) return null;

//         // Calculate price: outputAmount / inputAmount (in SOL)
//         const priceInSol = Number(quote.outputAmount) / Number(amountLamports);
        
//         return {
//             priceInSol,
//             outputAmount: quote.outputAmount,
//             inputAmount: amountLamports,
//             poolIds: quote.routePlan?.map(r => r.poolId) || [],
//             priceImpactPct: quote.priceImpactPct,
//         };
//     } catch (error) {
//         console.error("Failed to get Raydium price:", error);
//         return null;
//     }
// }
export async function getRaydiumPrice({
  inputMint = WSOL,
  outputMint,
  outputAmount = 1_000_000_000,
}) {
  if (!outputMint) return null;

  try {
    const quote = await getRaydiumBaseOutQuote({
      inputMint,
      outputMint,
      outputAmount,
    });

    const inputAmount = Number(quote?.inputAmount || 0);

    if (!inputAmount) return null;

    return {
      priceNative: inputAmount / 1_000_000_000,
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      poolIds: quote.routePlan?.map((r) => r.poolId) || [],
      priceImpactPct: quote.priceImpactPct,
      raw: quote,
    };
  } catch (error) {
    console.warn("Failed to get Raydium price:", error?.message || error);
    return null;
  }
}

export async function getRaydiumSellPrice({
  inputMint,
  outputMint = WSOL,
  inputAmount = 1_000_000_000,
}) {
  if (!inputMint) return null;

  try {
    const quote = await getRaydiumQuote({
      inputMint,
      outputMint,
      amountLamports: inputAmount,
    });

    const outputAmount = Number(quote?.outputAmount || 0);

    if (!outputAmount) return null;

    return {
      priceNative: outputAmount / 1_000_000_000,
      inputAmount,
      outputAmount: quote.outputAmount,
      poolIds: quote.routePlan?.map((r) => r.poolId) || [],
      priceImpactPct: quote.priceImpactPct,
      raw: quote,
    };
  } catch (error) {
    console.warn("Failed to get Raydium sell price:", error?.message || error);
    return null;
  }
}

export async function getRaydiumMidPrice({
  mint,
  tokenAmount = 1_000_000_000,
}) {
  if (!mint) return null;

  const [buy, sell] = await Promise.all([
    getRaydiumPrice({
      outputMint: mint,
      outputAmount: tokenAmount,
    }),
    getRaydiumSellPrice({
      inputMint: mint,
      inputAmount: tokenAmount,
    }),
  ]);

  const buyPrice = Number(buy?.priceNative || 0);
  const sellPrice = Number(sell?.priceNative || 0);

  if (!buyPrice && !sellPrice) return null;

  const midPrice =
    buyPrice && sellPrice
      ? (buyPrice + sellPrice) / 2
      : buyPrice || sellPrice;

  return {
    priceNative: midPrice,
    buyPriceNative: buyPrice || null,
    sellPriceNative: sellPrice || null,
    spreadNative: buyPrice && sellPrice ? buyPrice - sellPrice : null,
    spreadPct:
      buyPrice && sellPrice && midPrice
        ? ((buyPrice - sellPrice) / midPrice) * 100
        : null,
    buy,
    sell,
  };
}


export async function getPoolsFromGecko(tokenMint) {
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools`;

  const response = await fetch(url);
  if (response.status === 404) {
    console.warn("Gecko pools unavailable:");
    return [];
  }

  if (!response.ok) {
    console.warn(`Gecko pools failed: ${response.status}`);
    return [];
  }

  const json = await response.json();

  return (json.data || []).map(pool => {
    const a = pool.attributes || {};
    const dexId = pool.relationships?.dex?.data?.id || "gecko";

    return {
      poolAddress: a.address,
      dex: dexId,
      name: a.name,
      reserveUsd: Number(a.reserve_in_usd || 0),
      priceNative: a.base_token_price_native_currency
        ? String(a.base_token_price_native_currency)
        : null,
      priceUsd: a.base_token_price_usd
        ? String(a.base_token_price_usd)
        : (a.token_price_usd ? String(a.token_price_usd) : null),
      poolCreatedAt: a.pool_created_at || null,
      volumeUsd: a.volume_usd || null,
    };
  });
}


export async function getBirdeyeOhlcv({
  mint,
  quoteMint = WSOL,
  type = "5m",
}) {
  if (!mint) return [];

  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - 60 * 60 * 24;

  const params = new URLSearchParams({
    baseAddress: mint,
    quoteAddress: quoteMint,
    type,
    timeFrom: String(timeFrom),
    timeTo: String(timeTo),
  });

  const res = await fetch(`/api/birdeye/ohlcv?${params.toString()}`);
  const json = await res.json();

  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Birdeye OHLCV failed: ${res.status}`);
  }

  return json.data || [];
}