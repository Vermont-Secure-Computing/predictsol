import { PublicKey } from "@solana/web3.js";

export const NETWORK = "devnet";

export const PREDICTSOL_PROGRAM_ID = new PublicKey("BkNTEaYRntnPsgMZPKoh8AoQ5b7H75sweWivcUNxcm1V");
export const TRUTH_NETWORK_PROGRAM_ID = new PublicKey("31wdq6EJgHKRjZotAjc6vkuJ7aRyQPauwmgadPiEm8EY");

export const FALLBACK_RPC_URLS = [
  localStorage.getItem("customRpcUrl") || "https://api.devnet.solana.com",
  "https://api.devnet.solana.com",
  "https://solana-testnet.drpc.org/",
];

export const DEFAULT_RPC_URL = FALLBACK_RPC_URLS[0];

export const NETWORK_NAME = "DevNet";
export const SWITCH_LINK_LABEL = "Open in MainNet";
export const SWITCH_LINK_URL = "https://predictsol.com";
