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

  return {
    ...base,
    VERSION_NAME: versionName,
    AVAILABLE_VERSIONS: versionMap,
  };
}
