import { PublicKey } from "@solana/web3.js";

export const NETWORK = "mainnet";

export const PREDICTSOL_PROGRAM_ID = new PublicKey("BRjCjFUFQmd3tVCSvWH8NqkJyULbgRKzTTbFzdZzsotV");
export const TRUTH_NETWORK_PROGRAM_ID = new PublicKey("A1TH3GZoz6QV4wPECMH2r3tnV3wEWvEtwZwGnfP3U6RX");

export const FALLBACK_RPC_URLS = [
    localStorage.getItem("customRpcUrl") || "https://predictsol.com/rpc",
    "https://solana-rpc.publicnode.com",
    "https://go.getblock.io/4136d34f90a6488b84214ae26f0ed5f4",
    "https://api.mainnet-beta.solana.com",
];

export const DEFAULT_RPC_URL = FALLBACK_RPC_URLS[0];

export const NETWORK_NAME = "MainNet";
export const SWITCH_LINK_LABEL = "Open in DevNet";
export const SWITCH_LINK_URL = "https://devnet.predictsol.com";
