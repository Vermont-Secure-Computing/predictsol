import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link } from "react-router-dom";

import { getPredictProgram } from "../lib/anchorClient";
import { getPredictReadonlyProgram } from "../lib/anchorReadOnly";
import { getConstants } from "../constants";
import { formatCompactNumber } from "../utils/compactNumber"

export default function EventsList() {
  const wallet = useWallet();
  const { CATEGORY_OPTIONS } = getConstants();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [vaultBalances, setVaultBalances] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("new");


  const program = useMemo(() => {
    if (wallet?.publicKey && wallet.connected) return getPredictProgram(wallet);
    return getPredictReadonlyProgram();
  }, [wallet.publicKey, wallet.connected]);

  const filteredEvents = useMemo(() => {
    let list = [...events];
  
    // category filter
    if (selectedCategory !== "all") {
      list = list.filter((row) => Number(row.account.category) === Number(selectedCategory));
    }
  
    // search filter
    if (searchTerm.trim() !== "") {
      const q = searchTerm.toLowerCase();
      list = list.filter((row) => {
        const ev = row.account;
        return (
          ev.title?.toLowerCase().includes(q) ||
          row.publicKey.toBase58().toLowerCase().includes(q)
        );
      });
    }
  
    // sorting
    if (sortMode === "new") {
      list.sort(
        (a, b) =>
          (b.account.createdAt?.toNumber?.() ?? 0) -
          (a.account.createdAt?.toNumber?.() ?? 0)
      );
    }
  
    if (sortMode === "trending") {
      list.sort((a, b) => {
        const av = vaultBalances[a.account.collateralVault.toBase58()] ?? 0;
        const bv = vaultBalances[b.account.collateralVault.toBase58()] ?? 0;
        return bv - av; // higher SOL = more trending
      });
    }
  
    return list;
  }, [events, selectedCategory, searchTerm, sortMode, vaultBalances]);
   

  function getCategoryLabel(cat) {
    const found = CATEGORY_OPTIONS.find((x) => x.value === Number(cat));
    return found?.label || "Unknown";
  }

  function getCategoryStyle(cat) {
    switch (Number(cat)) {
      case 0:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
      case 1:
        return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
      case 2:
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200";
      case 3:
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
    }
  }

  async function loadEvents() {
    if (!program) return;
    setErr("");
    setLoading(true);
  
    try {
      const rows = await program.account.event.all();
  
      rows.sort(
        (a, b) =>
          (b.account.createdAt?.toNumber?.() ?? 0) -
          (a.account.createdAt?.toNumber?.() ?? 0)
      );
  
      setEvents(rows);
  
      // Fetch vault balances in ONE RPC call
      const conn = program.provider.connection;
  
      const vaultKeys = rows.map((r) => r.account.collateralVault);
  
      const infos = await conn.getMultipleAccountsInfo(vaultKeys);
  
      const map = {};
      for (let i = 0; i < vaultKeys.length; i++) {
        const k = vaultKeys[i].toBase58();
        map[k] = infos[i]?.lamports ?? 0;
      }
  
      setVaultBalances(map);
  
    } catch (e) {
      console.log("load events error: ", e);
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }
  

  useEffect(() => {
    if (!program) return;
    loadEvents();
  }, [program]);

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-black/90">
      {/* Controls */}
<div className="flex flex-col gap-4 mb-6">

{/* Row 1: Refresh + Wallet status */}
<div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
  <button
    onClick={loadEvents}
    disabled={loading}
    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
  >
    {loading ? "Loading..." : "Refresh"}
  </button>

  <div className="text-sm text-gray-500 dark:text-gray-400">
    {wallet.publicKey
      ? "Wallet Connected"
      : "Read-only mode (connect wallet to interact)"}
  </div>
</div>

{/* Row 2: LEFT buttons, RIGHT search */}
<div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">

  {/* LEFT SIDE BUTTONS */}
  <div className="flex flex-wrap gap-2 sm:w-[70%]">
    <button
      onClick={() => setSelectedCategory("all")}
      className={`px-4 py-2 rounded-xl text-sm font-bold border transition
        ${
          selectedCategory === "all"
            ? "bg-gray-900 text-white dark:bg-white dark:text-black border-gray-900 dark:border-white"
            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"
        }`}
    >
      All
    </button>

    <button
      onClick={() => setSortMode("trending")}
      className={`px-4 py-2 rounded-xl text-sm font-bold border transition
        ${
          sortMode === "trending"
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"
        }`}
    >
      Trending
    </button>

    <button
      onClick={() => setSortMode("new")}
      className={`px-4 py-2 rounded-xl text-sm font-bold border transition
        ${
          sortMode === "new"
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"
        }`}
    >
      New
    </button>

    {CATEGORY_OPTIONS.map((cat) => (
      <button
        key={cat.value}
        onClick={() => setSelectedCategory(cat.value)}
        className={`px-4 py-2 rounded-xl text-sm font-bold border transition
          ${
            Number(selectedCategory) === Number(cat.value)
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"
          }`}
      >
        {cat.label}
      </button>
    ))}
  </div>

  {/* RIGHT SIDE SEARCH */}
  <div className="sm:w-[30%] w-full">
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search event..."
      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700
                 bg-white dark:bg-gray-900 text-sm"
    />
  </div>
</div>
</div>


      {err && <div className="text-red-500 mb-4">{err}</div>}

      {filteredEvents.length === 0 && !loading && (
        <p className="opacity-70 text-gray-700 dark:text-gray-300">
          No events found.
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEvents.map((row) => {
          const ev = row.account;
          const catLabel = getCategoryLabel(ev.category);

          return (
            <Link
              key={row.publicKey.toBase58()}
              to={`/event/${row.publicKey.toBase58()}`}
              className="block"
            >
              <div className="p-5 rounded-2xl border border-gray-200 bg-white shadow-sm
                              dark:border-gray-800 dark:bg-gray-900/60 dark:backdrop-blur
                              hover:shadow-lg hover:-translate-y-1 hover:border-indigo-500
                              transition duration-200">

                {/* Category Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${getCategoryStyle(
                      ev.category
                    )}`}
                  >
                    {catLabel}
                  </span>

                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date((ev.createdAt?.toNumber?.() ?? 0) * 1000).toLocaleDateString()}
                  </span>
                </div>

                {/* Title */}
                <div className="font-extrabold text-lg text-gray-900 dark:text-white mb-3 line-clamp-2">
                  {ev.title}
                </div>

                {/* Info */}
                <div className="text-xs text-gray-600 dark:text-gray-300 break-all">
                  PDA: {row.publicKey.toBase58()}
                </div>

                <div className="text-xs text-gray-600 dark:text-gray-300 break-all mt-1">
                  Creator: {ev.creator.toBase58()}
                </div>

                <div className="text-xs text-gray-600 dark:text-gray-300 break-all mt-1">
                  Vault: {ev.collateralVault.toBase58()}
                </div>

                <div
                  title={`${((vaultBalances[ev.collateralVault.toBase58()] ?? 0) / 1e9).toFixed(6)} SOL`}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-300 mt-2"
                >
                  {formatCompactNumber((vaultBalances[ev.collateralVault.toBase58()] ?? 0) / 1e9)} SOL
                </div>

              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
