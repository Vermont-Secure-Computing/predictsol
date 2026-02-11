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
              style={{ width: 40, height: 40 }}
            />

            <img
              src="/images/predict_text.png"
              alt="PredictSol"
              style={{ height: 20 }}
            />
          </div>

          {/* MIDDLE: NAV LINKS */}
          <nav style={{ display: "flex", gap: 16 }}>
            <Link to="/">Home</Link>
            <Link to="/docs">Documentation</Link>
          </nav>

          {/* RIGHT: WALLET BUTTON */}
          <WalletMultiButton />
        </header>

        <hr style={{ margin: "16px 0" }} />

        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/" style={{ textDecoration: "none", fontWeight: "bold" }}>
            Event List
          </Link>
          <Link to="/create" style={{ textDecoration: "none", fontWeight: "bold" }}>
            Create Event
          </Link>
        </div>


        <Routes>
          <Route path="/" element={<EventsList />} />
          <Route path="/create" element={<CreateEvent />} />
          <Route path="/event/:eventPda" element={<EventDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
