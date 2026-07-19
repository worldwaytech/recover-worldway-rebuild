// TODO(Lovable Cloud): this stub replaces the generated Supabase client until
// Cloud is enabled. Import surface matches `@supabase/supabase-js` for the
// small subset the app currently uses; every method throws or returns a safe
// empty result so UI keeps rendering.

type Result<T> = { data: T; error: Error | null };

function notConfigured(): Error {
  return new Error(
    "Lovable Cloud not yet enabled — Supabase client is stubbed. Approve Cloud to activate.",
  );
}

const authStub = {
  async getSession(): Promise<Result<{ session: null }>> {
    return { data: { session: null }, error: null };
  },
  onAuthStateChange(_cb: (event: string, session: null) => void) {
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async signUp() {
    return { data: { session: null, user: null }, error: notConfigured() };
  },
  async signInWithPassword() {
    return { data: { session: null, user: null }, error: notConfigured() };
  },
  async signOut() {
    return { error: null };
  },
};

function tableStub() {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
    async single() {
      return { data: null, error: notConfigured() };
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: [], error: null });
    },
  };
  return chain;
}

export const supabase = {
  auth: authStub,
  from(_table: string) {
    return tableStub();
  },
  functions: {
    async invoke() {
      return { data: null, error: notConfigured() };
    },
  },
};

export type SupabaseClientStub = typeof supabase;
