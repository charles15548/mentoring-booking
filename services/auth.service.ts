import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/models/user.model";

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { nombres: name, rol: "mentee" } },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentProfile(userId: string) {
  return supabase
    .from("profiles")
    .select("id, nombres, apellidos, email, rol, activo")
    .eq("id", userId)
    .single<UserProfile>();
}