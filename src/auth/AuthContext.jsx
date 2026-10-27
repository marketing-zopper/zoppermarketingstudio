import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, fetchSession, setUnauthorizedHandler } from "../admin/api.js";

// state: loading | signed_out | denied | ok | error
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ state: "loading" });

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSession();
      setSession({ ...data, state: data.status });
    } catch (err) {
      setSession({ state: "error", error: err.message });
    }
  }, []);

  useEffect(() => {
    refresh();
    // Any protected API answering 401 means the session changed: re-evaluate it.
    setUnauthorizedHandler(refresh);
    return () => setUnauthorizedHandler(() => {});
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setSession({ state: "signed_out" });
    }
  }, []);

  return <AuthContext.Provider value={{ ...session, refresh, signOut }}>{children}</AuthContext.Provider>;
}
