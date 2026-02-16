import { useEffect, useState } from "react";
import { fetchDexscreenerPairsSolana, pickBestSolPool } from "../utils/dexscreener";

export function useBestPools({ trueMint, falseMint }) {
  const [state, setState] = useState({
    loading: true,
    err: "",
    truePool: null,
    falsePool: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setState(s => ({ ...s, loading: true, err: "" }));

        const [truePairs, falsePairs] = await Promise.all([
          trueMint ? fetchDexscreenerPairsSolana(trueMint) : Promise.resolve([]),
          falseMint ? fetchDexscreenerPairsSolana(falseMint) : Promise.resolve([]),
        ]);

        const truePool = pickBestSolPool(truePairs);
        const falsePool = pickBestSolPool(falsePairs);

        console.log("truePool: ", truePool)
        console.log("falsePool: ", falsePool)

        if (!cancelled) {
          setState({ loading: false, err: "", truePool, falsePool });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, err: e?.message || String(e), truePool: null, falsePool: null });
      }
    })();

    return () => { cancelled = true; };
  }, [trueMint, falseMint]);

  return state;
}
