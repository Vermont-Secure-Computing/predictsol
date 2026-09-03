import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import EventsList from "./pages/EventsList";
import CreateEvent from "./pages/CreateEvent";
import EventDetail from "./pages/EventDetail";
import Footer from "./components/Footer";
import DisclaimerModal from "./components/DisclaimerModa";
import SecurityPolicy from "./pages/SecurityPolicy";
import { getConstants } from "./constants";
import FAQ from "./pages/FAQ";
import Documents from "./pages/Documents";

export default function App() {
  const { PREDICTSOL_PROGRAM_ID } = getConstants();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setNetworkMenuOpen(false);
  };

  return (
    <BrowserRouter>
      <div className="w-full mx-auto p-0 sm:p-4">
        <header className="relative isolate z-[9999] w-full border-b border-gray-200 dark:border-gray-800">
          <div className="pointer-events-none absolute inset-0 bg-white/80 backdrop-blur dark:bg-gray-950/60" />

          <div className="relative px-4 py-3">
            {/* TOP ROW */}
            <div className="flex items-start justify-between gap-3">
              {/* LOGO / INFO */}
              <div className="flex min-w-0 flex-col">
                <Link
                  to="/"
                  onClick={closeMenus}
                  className="flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <img
                    src="/images/predict_drawing.png"
                    alt="Logo"
                    className="h-9 w-auto dark:invert sm:h-10"
                  />

                  <img
                    src="/images/predict_text.png"
                    alt="PredictSol"
                    className="h-4 w-auto dark:invert sm:h-5"
                  />
                </Link>

                {/* Tagline */}
                <div className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 sm:text-xs">
                  World’s first decentralized community prediction tokenizer
                </div>

                {/* Program ID */}
                <a
                  href={`https://explorer.solana.com/address/${PREDICTSOL_PROGRAM_ID.toBase58()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 font-mono text-[11px] text-indigo-600 hover:underline dark:text-indigo-300"
                  title={PREDICTSOL_PROGRAM_ID.toBase58()}
                >
                  <span className="sm:hidden">
                    {PREDICTSOL_PROGRAM_ID.toBase58().slice(0, 4)}…
                    {PREDICTSOL_PROGRAM_ID.toBase58().slice(-4)}
                  </span>

                  <span className="hidden break-all sm:inline">
                    {PREDICTSOL_PROGRAM_ID.toBase58()}
                  </span>
                </a>
              </div>

              {/* MOBILE BUTTONS */}
              <div className="flex shrink-0 items-center gap-2 sm:hidden">
                <WalletMultiButton />

                {/* Hamburger */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen((prev) => !prev);
                    setNetworkMenuOpen(false);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-200 hover:bg-sky-300"
                  aria-label="Toggle navigation menu"
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6b7280"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="h-6 w-6"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6b7280"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="h-6 w-6"
                    >
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </div>

              {/* DESKTOP NAV */}
              <div className="hidden items-center gap-5 sm:flex">
                <nav className="flex items-center gap-4 text-sm">
                  <Link
                    to="/"
                    className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-300"
                  >
                    Event List
                  </Link>

                  <Link
                    to="/create"
                    className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-300"
                  >
                    Create Event
                  </Link>

                  <Link
                    to="/docs"
                    className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-300"
                  >
                    White Paper
                  </Link>

                  <Link
                    to="/faq"
                    className="text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-300"
                  >
                    FAQ
                  </Link>

                  {/* NETWORK SITES DESKTOP */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setNetworkMenuOpen((prev) => !prev)
                      }
                      className="flex items-center gap-1 rounded-md px-3 py-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-expanded={networkMenuOpen}
                    >
                      Network Sites

                      <svg
                        className={`h-4 w-4 transition-transform ${
                          networkMenuOpen ? "rotate-180" : ""
                        }`}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {networkMenuOpen && (
                      <div className="absolute right-0 top-full z-[10000] mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                        <a
                          href="https://devnet.predictsol.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setNetworkMenuOpen(false)}
                          className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <div className="font-medium">
                            devnet.predictsol.com
                          </div>

                          <div className="text-xs text-gray-500">
                            Devnet
                          </div>
                        </a>

                        <a
                          href="https://predictsol.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setNetworkMenuOpen(false)}
                          className="block border-t border-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <div className="font-medium">
                            predictsol.com
                          </div>

                          <div className="text-xs text-gray-500">
                            Mainnet
                          </div>
                        </a>
                      </div>
                    )}
                  </div>
                </nav>

                {/* Desktop wallet */}
                <WalletMultiButton />
              </div>
            </div>

            {/* MOBILE MENU */}
            {mobileMenuOpen && (
              <nav className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900 sm:hidden">
                <Link
                  to="/"
                  onClick={closeMenus}
                  className="block border-b border-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Event List
                </Link>

                <Link
                  to="/create"
                  onClick={closeMenus}
                  className="block border-b border-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Create Event
                </Link>

                <Link
                  to="/docs"
                  onClick={closeMenus}
                  className="block border-b border-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  White Paper
                </Link>

                <Link
                  to="/faq"
                  onClick={closeMenus}
                  className="block border-b border-gray-100 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  FAQ
                </Link>

                {/* MOBILE NETWORK SITES */}
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setNetworkMenuOpen((prev) => !prev)
                    }
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span>Network Sites</span>

                    <svg
                      className={`h-4 w-4 transition-transform ${
                        networkMenuOpen ? "rotate-180" : ""
                      }`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {networkMenuOpen && (
                    <div className="border-t border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/50">
                      <a
                        href="https://devnet.predictsol.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeMenus}
                        className="block px-6 py-3 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <div className="font-medium">
                          devnet.predictsol.com
                        </div>

                        <div className="text-xs text-gray-500">
                          Devnet
                        </div>
                      </a>

                      <a
                        href="https://predictsol.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeMenus}
                        className="block px-6 py-3 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <div className="font-medium">
                          predictsol.com
                        </div>

                        <div className="text-xs text-gray-500">
                          Mainnet
                        </div>
                      </a>
                    </div>
                  )}
                </div>
              </nav>
            )}
          </div>
        </header>

        <hr style={{ margin: "16px 0" }} />

        <DisclaimerModal />

        <Routes>
          <Route path="/" element={<EventsList />} />
          <Route path="/create" element={<CreateEvent />} />
          <Route path="/event/:eventPda" element={<EventDetail />} />
          <Route path="/security-policy" element={<SecurityPolicy />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/docs" element={<Documents />} />
        </Routes>

        <Footer />
      </div>
    </BrowserRouter>
  );
}