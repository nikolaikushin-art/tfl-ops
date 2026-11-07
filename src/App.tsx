import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider, useStore } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { TflApp } from "./TflApp";
import { SignInPage } from "./screens/SignInTfl";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingForm } from "@/components/OnboardingForm";
import { useEffect, useState } from "react";
import { ServerSync } from "@/components/ServerSync";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) return <SignInPage />;
  return <>{children}</>;
}

/**
 * ThemeProvider sits *above* the auth gate on purpose: the sign-in screen is
 * part of the product, so it has to honour the saved theme and be able to
 * change it, rather than waiting for a session before colour works.
 */
/**
 * The public onboarding form lives on a hash route and sits outside the store
 * and the sign-in gate: whoever opens the link must not load any CRM data.
 */
function usePublicHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const PublicOrApp = () => {
  const hash = usePublicHash();
  if (hash.startsWith("#/onboarding/")) {
    return (
      <ThemeProvider>
        <OnboardingForm hash={hash} />
      </ThemeProvider>
    );
  }
  return (
    <ErrorBoundary fullScreen>
      <App />
    </ErrorBoundary>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <StoreProvider>
        <TooltipProvider>
          <Toaster />
          <ServerSync />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route
                path="/*"
                element={
                  <AuthGate>
                    <TflApp />
                  </AuthGate>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </StoreProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default PublicOrApp;
