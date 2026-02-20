import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { getConstants } from "../constants";

const RpcSettingsModal = ({ isOpen, onClose }) => {
  const constants = getConstants();
  const DEFAULT_RPC = constants.DEFAULT_RPC_URL;

  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const savedRpc = useMemo(() => localStorage.getItem("customRpcUrl"), []);

  useEffect(() => {
    if (savedRpc) setRpcUrl(savedRpc);
  }, [savedRpc]);

  const hasMaliciousChars = (url) => {
    const pattern = /<script|javascript:|data:text|<|>|"|'/i;
    return pattern.test(url);
  };

  const isValidHttpUrl = (string) => {
    try {
      const url = new URL(string);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const testRpcConnection = async (url) => {
    try {
      const res = await axios.post(
        url,
        { jsonrpc: "2.0", id: 1, method: "getVersion" },
        { headers: { "Content-Type": "application/json" }, timeout: 8000 }
      );
      return res.status === 200 && !!res.data?.result;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    setError("");

    const trimmed = rpcUrl.trim();

    if (trimmed.length < 10 || trimmed.length > 200) {
      setError("RPC URL must be between 10 and 200 characters.");
      return;
    }

    if (hasMaliciousChars(trimmed)) {
      setError("RPC URL contains forbidden or unsafe characters.");
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      setError("Please enter a valid HTTP/HTTPS URL.");
      return;
    }

    setLoading(true);
    const works = await testRpcConnection(trimmed);

    if (!works) {
      setError("Unable to connect to this RPC endpoint.");
      setLoading(false);
      return;
    }

    localStorage.setItem("customRpcUrl", trimmed);
    window.location.reload();
  };

  const handleReset = () => {
    localStorage.removeItem("customRpcUrl");
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="rpc-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            // click outside to close
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            key="rpc-modal"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
            role="dialog"
            aria-modal="true"
            aria-label="RPC Settings"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Network Settings
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Set a custom Solana RPC endpoint for faster / more reliable requests.
                </p>
              </div>

              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
                type="button"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Solana RPC URL
              </label>

              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                placeholder={DEFAULT_RPC}
                disabled={loading}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900
                           placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-indigo-500
                           disabled:opacity-60 disabled:cursor-not-allowed
                           dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 dark:border-gray-800 dark:bg-gray-900/40">
                  Default: {DEFAULT_RPC}
                </span>
                {savedRpc ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                    Custom RPC active
                  </span>
                ) : (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 dark:border-gray-800 dark:bg-gray-900/40">
                    Using default
                  </span>
                )}
              </div>

              {error && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
                  {error}
                </div>
              )}

              {loading && (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-200">
                  Checking connection…
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-between sm:items-center dark:border-gray-800">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700
                             hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="w-full sm:w-auto rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800
                             hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed
                             dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/30"
                >
                  Reset
                </button>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="w-full sm:w-auto rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                           hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Saving…" : "Save & Reload"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RpcSettingsModal;
