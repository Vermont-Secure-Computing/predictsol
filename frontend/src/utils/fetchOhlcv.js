export async function fetchPoolOhlcv({
  network = "solana",
  poolAddress,
  timeframe = "minute",
  aggregate = 5,
  limit = 200,
  currency = "sol",
  tokenSide = "base",
  beforeTimestamp,
} = {}) {
  if (!poolAddress) throw new Error("poolAddress is required");

  const baseUrl = `https://api.coingecko.com/api/v3/onchain/networks/solana/pools/${poolAddress}/ohlcv/${timeframe}`;
  const params = new URLSearchParams();
  if (aggregate != null) params.set("aggregate", String(aggregate));
  if (limit != null) params.set("limit", String(limit));
  if (currency) params.set("currency", currency);
  if (tokenSide) params.set("token", tokenSide);
  if (beforeTimestamp) params.set("before_timestamp", String(beforeTimestamp));

  const url = `${baseUrl}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-cg-demo-api-key": import.meta.env.VITE_COINGECKO_DEMO_KEY,
    },
  });

  if (!res.ok) {
    console.log("response not ok")
    const text = await res.text().catch(() => "");
    throw new Error(`OHLCV fetch failed (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  console.log("coin response json: ", json)
  const list =
    json?.data?.attributes?.ohlcv_list ||
    json?.data?.attributes?.ohlcv ||
    json?.ohlcv_list ||
    [];

  return list.map((row) => ({
    t: Number(row[0]) * 1000,
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5] ?? 0),
  }));
}
