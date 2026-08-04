// TODO(Lovable Cloud): reconnect Supabase auth. This stub preserves the
// AuthProvider/useAuth interface used across the app. Once Cloud is enabled,
// swap the internals to use `@/integrations/supabase/client` and the real
// session listener.

import { createContext, useContext, useState, type ReactNode } from "react";

export interface Agent {
  id: string;
  email: string;
  fullName: string;
  agency: string;
  provider: string;
}

export interface SignupResult {
  needsConfirmation: boolean;
}

interface AuthContextValue {
  agent: Agent | null;
  loading: boolean;
  signup: (data: {
    email: string;
    password: string;
    fullName: string;
    agency: string;
  }) => Promise<SignupResult>;
  login: (email: string, password: string) => Promise<void>;
  social: (provider: "google") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading] = useState(false);

  async function signup(): Promise<SignupResult> {
    // TODO(Lovable Cloud): supabase.auth.signUp
    throw new Error("Authentication is not yet connected. Enable Lovable Cloud to activate.");
  }
  async function login(): Promise<void> {
    // TODO(Lovable Cloud): supabase.auth.signInWithPassword
    throw new Error("Authentication is not yet connected. Enable Lovable Cloud to activate.");
  }
  async function social(): Promise<void> {
    // TODO(Lovable Cloud): OAuth via managed provider
    throw new Error("Authentication is not yet connected. Enable Lovable Cloud to activate.");
  }
  async function logout(): Promise<void> {
    setAgent(null);
  }

  return (
    <AuthContext.Provider value={{ agent, loading, signup, login, social, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
