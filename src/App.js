import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import JoinGroup from "./pages/JoinGroup";
import Waiting from "./pages/Waiting";
import Chat from "./pages/Chat";
import AdminPanel from "./pages/AdminPanel";
import ProtectedRoute from "./components/ProtectedRoute";

import "./styles/global.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/join/:inviteCode" element={<JoinGroup />} />
        <Route path="/waiting" element={<Waiting />} />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly={true}>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
