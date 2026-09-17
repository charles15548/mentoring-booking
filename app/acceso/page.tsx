"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile } from "@/services/auth.service";

export default function AccesoPage() {
  const router = useRouter();

  useEffect(() => {
    async function iniciar() {
      const hash = new URLSearchParams(window.location.hash.substring(1));

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      // Eliminamos los tokens de la URL inmediatamente
      window.history.replaceState({}, "", "/acceso");

      if (!accessToken || !refreshToken) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await getCurrentProfile(data.user.id);

      if (!profile) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (profile.rol === "coordinador") {
        router.replace("/coordinador");
        return;
      }

      if (profile.rol === "mentor") {
        router.replace("/mentor");
        return;
      }

      router.replace("/mentores");
    }

    void iniciar();
  }, [router]);

  return (
    <main className="state-page">
      <p className="eyebrow">PROUNI · MENTORÍAS</p>
      <h1>Ingresando a tu espacio...</h1>
    </main>
  );
}