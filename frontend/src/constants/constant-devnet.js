import { PublicKey } from "@solana/web3.js";

export const NETWORK = "devnet";

export const PREDICTSOL_PROGRAM_ID = new PublicKey("4cRRBKBMEeNDJXvsHTkEVoEBgnSw4jFTfMXCQwL6n1qt");
export const TRUTH_NETWORK_PROGRAM_ID = new PublicKey("jQkyaTq7X9YphoWizETjJf1c1mAZzQPV5iR7afHk5s1");

export const FALLBACK_RPC_URLS = [
  localStorage.getItem("customRpcUrl") || "https://api.devnet.solana.com",
  "https://api.devnet.solana.com",
  "https://solana-testnet.drpc.org/",
];

export const DEFAULT_RPC_URL = FALLBACK_RPC_URLS[0];//"https://devnet.helius-rpc.com/?api-key=53dd1693-43cc-4545-880e-74fa732ab766"//

export const NETWORK_NAME = "DevNet";
export const SWITCH_LINK_LABEL = "Open in MainNet";
export const SWITCH_LINK_URL = "https://predictsol.com";
