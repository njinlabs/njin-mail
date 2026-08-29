import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import MailPage from "./pages/MailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mail" element={<MailPage />} />
      <Route path="/mail/:folderId" element={<MailPage />} />
      <Route path="*" element={<Navigate to="/mail" replace />} />
    </Routes>
  );
}
