import * as mainnet from "./constant-mainnet.js";
import * as devnet from "./constant-devnet.js";

export function getConstants() {
  const hostname = window.location.hostname;

  const versionMap = [
    { name: "Latest", url: "https://predictsol.com" },
    { name: "Devnet", url: "https://devnet.predictsol.com" },
  ];

  let versionName = "";
  if (hostname.includes("devnet")) versionName = "- Devnet";
  else if (hostname === "predictsol.com" || hostname === "www.predictsol.com") versionName = "- Latest";

  const base = import.meta.env.VITE_NETWORK === "mainnet" ? mainnet : devnet;

  const CATEGORY_OPTIONS = [
    { value: 0, label: "Other" },
    { value: 1, label: "Finance" },
    { value: 2, label: "Politics" },
    { value: 3, label: "Sports" },
  ];

  const MIN_BUY_SOL = 0.000001;
  const SWEEP_DELAY_SECS = 10 * 60//30 * 24 * 60 * 60; // 30 days

  return {
    ...base,
    VERSION_NAME: versionName,
    AVAILABLE_VERSIONS: versionMap,
    CATEGORY_OPTIONS,
    MIN_BUY_SOL,
    SWEEP_DELAY_SECS
  };
}
