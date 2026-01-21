import devnetPredict from "./devnet/predictsol_sc.json";
import mainnetPredict from "./mainnet/predictsol_sc.json";

import devnetTruth from "./devnet/truth_network.json";
import mainnetTruth from "./mainnet/truth_network.json";

function normalizeIdl(idl) {
  const cloned = JSON.parse(JSON.stringify(idl));
  const typeMap = new Map((cloned.types || []).map((t) => [t.name, t.type]));

  cloned.accounts = (cloned.accounts || []).map((acc) => {
    if (acc.type) return acc;
    const t = typeMap.get(acc.name);
    return t ? { ...acc, type: t } : acc;
  });

  return cloned;
}

const normalized = {
  devnet: {
    predict: normalizeIdl(devnetPredict),
    truth: normalizeIdl(devnetTruth),
  },
  mainnet: {
    predict: normalizeIdl(mainnetPredict),
    truth: normalizeIdl(mainnetTruth),
  },
};

export function getIdls(network) {
  const isMainnet = network === "mainnet";
  const pick = isMainnet ? normalized.mainnet : normalized.devnet;
  return {
    predictsolIDL: pick.predict,
    truthNetworkIDL: pick.truth,
  };
}

export function assertIdlMatchesProgramId(idl, programId, label = "program") {
  const idlAddr = idl?.address;
  if (idlAddr && programId && idlAddr !== programId.toBase58()) {
    throw new Error(
      `${label} IDL address (${idlAddr}) does not match constants (${programId.toBase58()})`
    );
  }
}

