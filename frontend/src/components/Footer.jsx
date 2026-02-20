import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FaGithub } from "react-icons/fa";
import RpcSettingsModal from "./RpcSettingsModal";
import { getConstants } from "../constants";

const Footer = () => {
  const constants = getConstants();

  const [showRpcModal, setShowRpcModal] = useState(false);
  const [rpcUrl, setRpcUrl] = useState("");
  const [rpcStatusText, setRpcStatusText] = useState("Checking...");
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const stored = constants.DEFAULT_RPC_URL;
    setRpcUrl(stored);

    axios
      .post(
        stored,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getVersion",
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      )
      .then((res) => {
        if (res.status === 200 && res.data.result) {
          setRpcStatusText("Online");
          setIsOnline(true);
        } else {
          setRpcStatusText("Offline");
          setIsOnline(false);
        }
      })
      .catch(() => {
        setRpcStatusText("Offline");
        setIsOnline(false);
      });
  }, []);

  return (
    <>
      <footer className="w-full border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">

          {/* Left Side */}
          <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
            <FaGithub className="text-lg" />
            <a
              href="https://github.com/Vermont-Secure-Computing/predictsol"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              View PredictSol on GitHub
            </a>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-6 text-gray-600 dark:text-gray-400">

            {/* Network Setting */}
            <button
              onClick={() => setShowRpcModal(true)}
              className="flex items-center gap-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              Network Setting

              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isOnline
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                }`}
              >
                {rpcStatusText}
              </span>
            </button>

            {/* Security Policy */}
            <Link
              to="/security-policy"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              Security Policy
            </Link>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-500 py-3">
          © {new Date().getFullYear()} PredictSol
        </div>
      </footer>

      <RpcSettingsModal
        isOpen={showRpcModal}
        onClose={() => setShowRpcModal(false)}
      />
    </>
  );
};

export default Footer;
