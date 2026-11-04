import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import Login from "./pages/Login.jsx";
import Landing from "./pages/Landing.jsx";
import Employee from "./pages/Employee.jsx";
import Admin from "./admin/Admin.jsx";

// PUBLIC page (opened from a QR code by Croma store staff) — deliberately outside AuthProvider/RequireAuth.
const FeedbackForm = lazy(() => import("./feedback/FeedbackForm.jsx"));

const guard = (page) => <RequireAuth>{page}</RequireAuth>;

function Internal() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={guard(<Landing />)} />
        <Route path="/employee" element={guard(<Employee />)} />
        <Route path="/admin" element={guard(<Admin />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/feedbackform"
        element={
          <Suspense fallback={null}>
            <FeedbackForm />
          </Suspense>
        }
      />
      <Route path="*" element={<Internal />} />
    </Routes>
  );
}
