import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import Login from "./pages/Login.jsx";
import Landing from "./pages/Landing.jsx";
import Employee from "./pages/Employee.jsx";
import Admin from "./admin/Admin.jsx";
import FeedbackDashboard from "./croma-feedback/FeedbackDashboard.jsx";

const guard = (page) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={guard(<Landing />)} />
        <Route path="/employee" element={guard(<Employee />)} />
        <Route path="/admin" element={guard(<Admin />)} />
        <Route path="/croma-feedback-dashboard" element={guard(<FeedbackDashboard />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
