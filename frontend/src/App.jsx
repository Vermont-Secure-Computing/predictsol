import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import EventsList from "./pages/EventsList";
import CreateEvent from "./pages/CreateEvent";
import EventDetail from "./pages/EventDetail";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 16, width: "100%", margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <nav style={{ display: "flex", gap: 12 }}>
            <Link to="/">Events</Link>
            <Link to="/create">Create Event</Link>
          </nav>
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
