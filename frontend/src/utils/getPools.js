const DEXSCREENER_BASE = "https://api.dexscreener.com";

export async function fetchDexscreenerPairsSolana(mint) {
    if (!mint) return [];
    const url = `${DEXSCREENER_BASE}/token-pairs/v1/solana/${mint}`;

    const res = await fetch(url);

    const json = await res.json();
    console.log("pools from dexscreener full response: ", json)

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


export async function getPoolsFromGecko(tokenMint) {

    const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools`;
    console.log("getpoolsfromgecko: ", url)
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        
        const json = await response.json();
        console.log("getpoolsfromgecko full response: ", json)
        
        return json.data.map(pool => {
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
    } catch (error) {
        console.error("Failed to fetch pools:", error);
        return [];
    }
}

