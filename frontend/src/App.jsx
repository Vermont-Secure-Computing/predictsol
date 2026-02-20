import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import EventsList from "./pages/EventsList";
import CreateEvent from "./pages/CreateEvent";
import EventDetail from "./pages/EventDetail";
import Footer from "./components/Footer";
import SecurityPolicy from "./pages/SecurityPolicy";
import { getConstants } from "./constants";
import FAQ from "./pages/FAQ";

export default function App() {

  const { PREDICTSOL_PROGRAM_ID } = getConstants();
  return (
    <BrowserRouter>
      <div className="w-full mx-auto p-0 sm:p-4">
        <header className="w-full border-b border-gray-200 bg-white/80 backdrop-blur px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            {/* LEFT: LOGO + PROGRAM ID */}
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <div className="flex flex-col">
                <Link
                  to="/"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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

                {/* Program ID link */}
                <a
                  href={`https://explorer.solana.com/address/${PREDICTSOL_PROGRAM_ID.toBase58()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 font-mono text-[11px] text-indigo-600 hover:underline dark:text-indigo-300"
                  title={PREDICTSOL_PROGRAM_ID.toBase58()}
                >
                  {/* Short on mobile, full on larger screens */}
                  <span className="sm:hidden">
                    {PREDICTSOL_PROGRAM_ID.toBase58().slice(0, 4)}…
                    {PREDICTSOL_PROGRAM_ID.toBase58().slice(-4)}
                  </span>
                  <span className="hidden sm:inline break-all">
                    {PREDICTSOL_PROGRAM_ID.toBase58()}
                  </span>
                </a>
              </div>

              {/* Wallet button on the right for mobile top row */}
              <div className="sm:hidden">
                <WalletMultiButton />
              </div>
            </div>

            {/* MIDDLE: NAV (scrollable on mobile) */}
            <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/30 sm:border-0 sm:bg-transparent sm:p-0">
              <Link to="/" className="text-gray-700 hover:underline dark:text-gray-300">
                Event List
              </Link>
              <Link to="/create" className="text-gray-700 hover:underline dark:text-gray-300">
                Create Event
              </Link>
              <Link to="/docs" className="text-gray-700 hover:underline dark:text-gray-300">
                Documentation
              </Link>
            </nav>

            {/* RIGHT: WALLET BUTTON (desktop) */}
            <div className="hidden sm:block">
              <WalletMultiButton />
            </div>
          </div>

          {/* MIDDLE: NAV LINKS */}
          <nav className="flex gap-4">
            <Link to="/" className="text-black dark:text-gray-300 hover:underline">
              Event List
            </Link>

            <Link to="/create" className="text-black dark:text-gray-300 hover:underline">
              Create Event
            </Link>

            <Link to="/docs" className="text-black dark:text-gray-300 hover:underline">
              White Paper
            </Link>
            <Link to="/faq" className="text-black dark:text-gray-300 hover:underline">
              FAQ
            </Link>
          </nav>

          {/* RIGHT: WALLET BUTTON */}
          <WalletMultiButton />
        </header>

        <hr style={{ margin: "16px 0" }} />

        <Routes>
          <Route path="/" element={<EventsList />} />
          <Route path="/create" element={<CreateEvent />} />
          <Route path="/event/:eventPda" element={<EventDetail />} />
          <Route path="/security-policy" element={<SecurityPolicy />} />
          <Route path="/faq" element={<FAQ />} />
        </Routes>

        <Footer />
      </div>
    </BrowserRouter>
  );
}
