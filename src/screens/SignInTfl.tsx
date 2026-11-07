import { useState } from "react";
import { Moon, Sun, X } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { useStore } from "@/lib/store";
import { fetchStatus, serverLogin } from "@/lib/serverSync";
import { nextThemeLabel, themeLabel, useTheme } from "@/lib/theme";

function LegalModal({
  kind,
  onClose,
}: {
  kind: "terms" | "privacy";
  onClose: () => void;
}) {
  const isTerms = kind === "terms";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-4">
      <div className="w-full max-w-[480px] max-h-[80vh] overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-semibold text-ink">
            {isTerms ? "Terms & Conditions" : "Privacy Policy"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-secondary">
          {isTerms ? (
            <>
              <p>Access to the The Film Location platform is restricted to authorised personnel and approved third parties. Accounts are personal and must not be shared.</p>
              <p>Client, location-owner, production and pricing data held in the platform is confidential business information and must not be exported or disclosed outside The Film Location except for legitimate business purposes.</p>
              <p>The platform is provided "as is" during its prototype/demo phase; The Film Location accepts no liability for decisions made solely on demo data.</p>
              <p>Full terms are available under Settings → Legal once signed in.</p>
            </>
          ) : (
            <>
              <p>The platform holds business contact data, correspondence history, commercial records and, where provided, KYC/onboarding documents.</p>
              <p>In this prototype, data is held client-side for the session only and is not transmitted to a third-party server.</p>
              <p>Individuals may request access to, correction of, or deletion of their data, subject to legitimate business and record-keeping requirements.</p>
              <p>Full policy is available under Settings → Legal once signed in.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sign-in, built like unique-ops' LoginPage: two steps, starts light, theme switch top-right.
 *   1. email  → the button stays dim until something is typed, then turns navy
 *   2. password (with Show/Hide and "Change" for the email) → navy once typed
 * The card is compact and the logo is large; nothing here scrolls on a laptop.
 */
export function SignInPage() {
  const { signIn, adoptServerSession } = useStore();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [legalOpen, setLegalOpen] = useState<"terms" | "privacy" | null>(null);

  const { theme, toggle } = useTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "email") {
      const v = email.trim();
      if (!v || !v.includes("@") || !v.includes(".")) {
        setError("Enter a valid email address.");
        return;
      }
      setError("");
      setStep("password");
      return;
    }
    setLoading(true);
    setError("");
    void (async () => {
      // With the server set up, only the server decides. Without it, the browser demo account is used.
      const status = await fetchStatus();
      if (status.configured) {
        const r = await serverLogin(email.trim(), password);
        if (r.user) adoptServerSession(r.user);
        else setError(r.error || "Invalid email or password.");
      } else if (!signIn(email.trim(), password)) {
        setError("Invalid email or password.");
      }
      setLoading(false);
    })();
  };

  return (
    <div className="auth-page">
      <button
        type="button"
        className="auth-theme"
        onClick={toggle}
        aria-label={`Change theme (now ${themeLabel(theme)})`}
        title={nextThemeLabel(theme)}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        <span>{themeLabel(theme)}</span>
      </button>
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <BrandLockup className="auth-logo" />
        </div>
        <p className="auth-sub">Commercial platform · authorised users only</p>
        {error ? <div className="auth-error">{error}</div> : null}
        <form onSubmit={handleSubmit} noValidate>
          {step === "email" ? (
            <>
              <label className="auth-label" htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@thefilmlocation.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="auth-btn" type="submit" disabled={!email.trim()}>
                Continue
              </button>
            </>
          ) : (
            <>
              <div className="auth-identity">
                <span>{email.trim()}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setPassword("");
                    setError("");
                    setShowPwd(false);
                  }}
                >
                  Change
                </button>
              </div>
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <div className="auth-pwd">
                <input
                  id="auth-password"
                  className="auth-input"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)}>
                  {showPwd ? "Hide" : "Show"}
                </button>
              </div>
              <button className="auth-btn" type="submit" disabled={loading || !password}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </>
          )}
        </form>
        <p className="auth-sub auth-foot">
          Access by administrator invitation
        </p>
      </div>
      <p className="auth-legal">
        <button type="button" onClick={() => setLegalOpen("terms")}>Terms</button>
        {" · "}
        <button type="button" onClick={() => setLegalOpen("privacy")}>Privacy</button>
      </p>
      {legalOpen ? <LegalModal kind={legalOpen} onClose={() => setLegalOpen(null)} /> : null}
    </div>
  );
}
