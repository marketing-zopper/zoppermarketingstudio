import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// Shared page shell: logo header, optional back link, signed-in user + sign out, footer.
export default function Layout({ children, back, wide = false }) {
  const auth = useAuth();
  const signedIn = auth && (auth.state === "ok" || auth.state === "denied");

  return (
    <div className="page">
      <header className="header">
        <Link to="/" className="header__brand" aria-label="Zopper Marketing Studio home">
          <img src="/zopper-logo.png" alt="Zopper" className="header__logo" />
        </Link>
        <div className="header__right">
          {back && (
            <Link to={back.to} className="header__link">
              ← {back.label}
            </Link>
          )}
          {signedIn && (
            <>
              <span className="header__user">{auth.email}</span>
              <button className="btn btn--ghost btn--sm" onClick={auth.signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <main className={`main${wide ? " main--wide" : ""}`}>{children}</main>

      <footer className="footer">© {new Date().getFullYear()} Zopper · Internal tools</footer>
    </div>
  );
}
