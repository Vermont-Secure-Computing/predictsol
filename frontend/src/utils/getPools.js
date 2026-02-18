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


import { Connection, PublicKey } from '@solana/web3.js';

// Raydium AMM V4 Program ID
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

export async function getPoolsByMint(mintAddress, rpcEndpoint) {
    const connection = new Connection(rpcEndpoint, 'confirmed');
    const tokenMint = new PublicKey(mintAddress);

    // Filters for Raydium AMM V4 Liquidity State
    // Pools store baseMint at offset 400 and quoteMint at offset 432
    const filters = [
        { dataSize: 752 }, // Typical size for Raydium V4 LiquidityState
        {
            memcmp: {
                offset: 400, // Offset for baseMint
                bytes: tokenMint.toBase58(),
            },
        },
    ];

    // Search for pools where our token is the baseMint
    let pools = await connection.getProgramAccounts(RAYDIUM_AMM_PROGRAM_ID, { filters });

    // Search for pools where our token is the quoteMint (e.g., Token/SOL)
    const quoteFilters = [
        { dataSize: 752 },
        {
            memcmp: {
                offset: 432, // Offset for quoteMint
                bytes: tokenMint.toBase58(),
            },
        },
    ];
    const quotePools = await connection.getProgramAccounts(RAYDIUM_AMM_PROGRAM_ID, { filters: quoteFilters });
    
    return [...pools, ...quotePools].map(p => ({
        poolAddress: p.pubkey.toBase58(),
        accountData: p.account.data
    }));
}

// Example usage:
// getPoolsByMint('4eKfR7D9bvkAV5hQQkrbTVpD3pe8CxzZNMAYSNEUDAgK', 'https://api.mainnet-beta.solana.com')
//    .then(pools => console.log('Found Pools:', pools));
