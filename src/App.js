import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import JoinGroup from "./pages/JoinGroup";
import Waiting from "./pages/Waiting";
import Chat from "./pages/Chat";
import AdminPanel from "./pages/AdminPanel";

import "./styles/global.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/join/:inviteCode" element={<JoinGroup />} />
        <Route path="/waiting" element={<Waiting />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
