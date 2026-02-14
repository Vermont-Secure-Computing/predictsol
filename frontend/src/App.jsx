import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import EventsList from "./pages/EventsList";
import CreateEvent from "./pages/CreateEvent";
import EventDetail from "./pages/EventDetail";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 16, width: "100%", margin: "0 auto" }}>
      <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* LEFT: LOGO + TEXT */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/images/predict_drawing.png"
              alt="Logo"
              className="w-[56px] h-[40px] dark:invert"
            />

            <img
              src="/images/predict_text.png"
              alt="PredictSol"
              className="h-[20px] dark:invert"
            />
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
              Documentation
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
        </Routes>
      </div>
    </BrowserRouter>
  );
}
