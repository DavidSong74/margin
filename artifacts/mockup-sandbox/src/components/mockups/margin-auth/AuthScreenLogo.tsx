import { useState, useId } from "react";

const ACCENT = "#7d9b76";
const ACCENT_HOVER = "#5f7a59";
const CREAM = "#faf7f2";
const CARD_BG = "#fffdf9";
const WARM_BORDER = "#e8e0d4";
const WARM_TEXT = "#4a3f35";
const MUTED = "#8c7d72";
const ERROR_COLOR = "#b05c4a";
const INPUT_FOCUS_SHADOW = "0 0 0 3px rgba(125,155,118,0.18)";

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={WARM_TEXT}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

type Mode = "login" | "signup";

interface FieldState {
  value: string;
  error: string;
  touched: boolean;
}

function useField(initial = ""): [FieldState, (v: string) => void, () => void, (e: string) => void] {
  const [state, setState] = useState<FieldState>({ value: initial, error: "", touched: false });
  const set = (v: string) => setState((s) => ({ ...s, value: v, error: "" }));
  const touch = () => setState((s) => ({ ...s, touched: true }));
  const setError = (e: string) => setState((s) => ({ ...s, error: e }));
  return [state, set, touch, setError];
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function AuthScreenLogo() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [name, setName, touchName] = useField();
  const [email, setEmail, touchEmail, setEmailError] = useField();
  const [password, setPassword, touchPassword, setPasswordError] = useField();
  const [confirm, setConfirm, touchConfirm, setConfirmError] = useField();

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const switchMode = (m: Mode) => {
    setMode(m);
    setShowPassword(false);
    setShowConfirm(false);
    setSuccess(false);
  };

  const validate = () => {
    let ok = true;
    if (!validateEmail(email.value)) { setEmailError("Please enter a valid email address."); ok = false; }
    if (password.value.length < 8) { setPasswordError("Password must be at least 8 characters."); ok = false; }
    if (mode === "signup" && password.value !== confirm.value) { setConfirmError("Passwords don't match."); ok = false; }
    return ok;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    touchEmail(); touchPassword();
    if (mode === "signup") { touchName(); touchConfirm(); }
    if (!validate()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSubmitting(false);
    setSuccess(true);
    console.log("Auth submitted:", { mode, name: name.value, email: email.value });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(ellipse at 60% 0%, #f0ebe0 0%, ${CREAM} 60%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px 40px",
        fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
        position: "relative",
      }}
    >
      {/* Paper texture overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
        opacity: 0.6,
      }} />

      {/* Logo mark */}
      <div style={{ textAlign: "center", marginBottom: "28px", position: "relative" }}>
        <img
          src="/__mockup/images/margin-logo.png"
          alt="Margin"
          style={{
            width: "88px",
            height: "88px",
            borderRadius: "22px",
            boxShadow: "0 4px 16px rgba(74,63,53,0.14), 0 1px 4px rgba(74,63,53,0.08)",
            display: "block",
            margin: "0 auto 14px",
          }}
        />
        <p style={{
          marginTop: 0,
          color: MUTED,
          fontSize: "0.88rem",
          letterSpacing: "0.02em",
          fontStyle: "italic",
        }}>
          Carry every journal you've ever kept.
        </p>
      </div>

      {/* Auth card */}
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: CARD_BG,
          borderRadius: "20px",
          border: `1px solid ${WARM_BORDER}`,
          boxShadow: "0 4px 6px -1px rgba(74,63,53,0.06), 0 16px 40px -8px rgba(74,63,53,0.12)",
          padding: "32px 28px 28px",
          position: "relative",
        }}
      >
        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "1.45rem",
          fontWeight: 600,
          color: WARM_TEXT,
          margin: "0 0 24px",
          letterSpacing: "-0.01em",
        }}>
          {mode === "login" ? "Welcome back" : "Start your archive"}
        </h2>

        {success && (
          <div style={{
            background: "#f0f7ee", border: `1px solid ${ACCENT}`, borderRadius: "10px",
            padding: "12px 16px", color: ACCENT_HOVER, fontSize: "0.88rem", marginBottom: "20px",
          }}>
            {mode === "login" ? "Signed in successfully!" : "Account created! Welcome to Margin."}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {mode === "signup" && (
              <div>
                <label htmlFor={nameId} style={labelStyle}>Name <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
                <input id={nameId} type="text" autoComplete="name" value={name.value} placeholder="Your name"
                  onChange={(e) => setName(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = INPUT_FOCUS_SHADOW; e.currentTarget.style.borderColor = ACCENT; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = WARM_BORDER; }}
                />
              </div>
            )}

            <div>
              <label htmlFor={emailId} style={labelStyle}>Email</label>
              <input id={emailId} type="email" autoComplete="email" required
                aria-invalid={!!email.error} aria-describedby={email.error ? `${emailId}-error` : undefined}
                value={email.value} placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)} onBlur={touchEmail}
                style={{ ...inputStyle, borderColor: email.error ? ERROR_COLOR : WARM_BORDER }}
                onFocus={(e) => { e.currentTarget.style.boxShadow = INPUT_FOCUS_SHADOW; e.currentTarget.style.borderColor = email.error ? ERROR_COLOR : ACCENT; }}
                onBlurCapture={(e) => { e.currentTarget.style.boxShadow = "none"; }}
              />
              {email.error && <p id={`${emailId}-error`} role="alert" style={errorStyle}>{email.error}</p>}
            </div>

            <div>
              <label htmlFor={passwordId} style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input id={passwordId} type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"} required
                  aria-invalid={!!password.error}
                  value={password.value} placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
                  onChange={(e) => setPassword(e.target.value)} onBlur={touchPassword}
                  style={{ ...inputStyle, paddingRight: "44px", borderColor: password.error ? ERROR_COLOR : WARM_BORDER }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = INPUT_FOCUS_SHADOW; e.currentTarget.style.borderColor = password.error ? ERROR_COLOR : ACCENT; }}
                  onBlurCapture={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)} style={eyeButtonStyle}>
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              {mode === "signup" && !password.error && (
                <p style={hintStyle}>At least 8 characters required.</p>
              )}
              {password.error && <p role="alert" style={errorStyle}>{password.error}</p>}
            </div>

            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: "-8px" }}>
                <button type="button" style={linkButtonStyle}>Forgot password?</button>
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label htmlFor={confirmId} style={labelStyle}>Confirm password</label>
                <div style={{ position: "relative" }}>
                  <input id={confirmId} type={showConfirm ? "text" : "password"} autoComplete="new-password" required
                    aria-invalid={!!confirm.error}
                    value={confirm.value} placeholder="Re-enter password"
                    onChange={(e) => setConfirm(e.target.value)} onBlur={touchConfirm}
                    style={{ ...inputStyle, paddingRight: "44px", borderColor: confirm.error ? ERROR_COLOR : WARM_BORDER }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = INPUT_FOCUS_SHADOW; e.currentTarget.style.borderColor = confirm.error ? ERROR_COLOR : ACCENT; }}
                    onBlurCapture={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button type="button" aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirm((v) => !v)} style={eyeButtonStyle}>
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {confirm.error && <p role="alert" style={errorStyle}>{confirm.error}</p>}
              </div>
            )}

            <button
              type="submit" disabled={submitting}
              style={{
                marginTop: "4px", width: "100%", padding: "13px",
                background: submitting ? "#a3b99e" : ACCENT,
                color: "#fff", border: "none", borderRadius: "11px",
                fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.01em",
                cursor: submitting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "background 0.2s, transform 0.1s",
                boxShadow: submitting ? "none" : `0 2px 8px rgba(125,155,118,0.35)`,
              }}
              onMouseEnter={(e) => { if (!submitting) { e.currentTarget.style.background = ACCENT_HOVER; e.currentTarget.style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = submitting ? "#a3b99e" : ACCENT; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {submitting && <Spinner />}
              {mode === "login" ? "Log in" : "Create account"}
            </button>
          </div>
        </form>

        <div style={{ display: "flex", alignItems: "center", margin: "20px 0", gap: "12px" }}>
          <div style={{ flex: 1, height: "1px", background: WARM_BORDER }} />
          <span style={{ color: MUTED, fontSize: "0.8rem", letterSpacing: "0.04em" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: WARM_BORDER }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" style={socialButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f0e8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <GoogleIcon />Continue with Google
          </button>
          <button type="button" style={socialButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f0e8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <AppleIcon />Continue with Apple
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: "22px", marginBottom: 0, color: MUTED, fontSize: "0.875rem" }}>
          {mode === "login" ? (
            <>New here?{" "}<button type="button" onClick={() => switchMode("signup")} style={linkButtonStyle}>Create an account</button></>
          ) : (
            <>Already have an account?{" "}<button type="button" onClick={() => switchMode("login")} style={linkButtonStyle}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: "6px", fontSize: "0.84rem",
  fontWeight: 500, color: "#5a4e45", letterSpacing: "0.01em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", fontSize: "0.95rem",
  color: "#3a2e26", background: "#fdfaf6",
  border: `1.5px solid #e8e0d4`, borderRadius: "10px",
  outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box", fontFamily: "inherit",
};

const eyeButtonStyle: React.CSSProperties = {
  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", color: "#8c7d72",
  padding: "4px", display: "flex", alignItems: "center", borderRadius: "6px",
  transition: "color 0.15s",
};

const errorStyle: React.CSSProperties = { marginTop: "5px", fontSize: "0.8rem", color: "#b05c4a", lineHeight: 1.4 };
const hintStyle: React.CSSProperties = { marginTop: "5px", fontSize: "0.78rem", color: "#8c7d72", lineHeight: 1.4 };

const linkButtonStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", color: "#7d9b76",
  fontSize: "inherit", fontWeight: 500, padding: 0,
  textDecoration: "underline", textDecorationColor: "rgba(125,155,118,0.3)",
  transition: "color 0.15s", fontFamily: "inherit",
};

const socialButtonStyle: React.CSSProperties = {
  width: "100%", padding: "11px 16px", background: "transparent",
  border: `1.5px solid #e8e0d4`, borderRadius: "11px",
  fontSize: "0.88rem", fontWeight: 500, color: "#4a3f35",
  cursor: "pointer", display: "flex", alignItems: "center",
  justifyContent: "center", gap: "10px",
  transition: "background 0.15s", fontFamily: "inherit", letterSpacing: "0.01em",
};
