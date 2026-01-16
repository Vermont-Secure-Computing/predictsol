import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import rawIdl from "./idl/predictol_sc.json";

function hydrateIdl(idl) {
  const cloned = JSON.parse(JSON.stringify(idl));
  const typeMap = new Map((cloned.types || []).map((t) => [t.name, t.type]));

  cloned.accounts = (cloned.accounts || []).map((acc) => {
    if (acc.type) return acc;
    const t = typeMap.get(acc.name);
    return t ? { ...acc, type: t } : acc;
  });

  return cloned;
}

export const IDL = hydrateIdl(rawIdl);

// Program ID from IDL
export const PROGRAM_ID = new PublicKey(IDL.address);
console.log("PROGRam id: ", IDL.address)
// Devnet RPC
export const NETWORK = clusterApiUrl("devnet");

// PDA seeds
export const SEED_COUNTER = "event_counter";
export const SEED_EVENT = "event";
export const SEED_COLLATERAL_VAULT = "collateral_vault";
