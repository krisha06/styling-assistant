import { supabase } from '@/services/supabase';

// "Confirm email" is disabled in the Supabase dashboard (deliberate choice —
// see CLAUDE.md section 5), so signUp() always returns an active session
// immediately, same as signIn().
export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

// scope: 'local' revokes just this device's session server-side instead of
// every session for the user ('global', the default) — this app has no
// multi-device-logout requirement, so 'local' is the more correct semantic.
// Still a network call either way though (verified live against the
// installed @supabase/auth-js: GoTrueAdminApi.signOut() always POSTs
// /logout regardless of scope) — a real network failure there re-throws
// rather than returning an {error}, so callers must catch it themselves
// (see index.tsx's onPress) instead of assuming this never rejects.
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error(error.message);
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
