"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentProfile, signOut } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("Cargando...");

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.replace("/login");
      const { data: profile } = await getCurrentProfile(data.user.id);
      if (!profile) return router.replace("/login");
      if (profile.rol === "mentor") return router.replace("/mentor");
      if (profile.rol === "coordinador") return router.replace("/coordinador");
      setName([profile.nombres, profile.apellidos].filter(Boolean).join(" ") || profile.email);
    }
    void loadProfile();
  }, [router]);

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">P</div><div><strong>PROUNI</strong><span>Mentorías</span></div></div>
        <div className="workspace-label">ESPACIO PERSONAL</div>
        <nav className="main-nav" aria-label="Navegación principal">
          <Link className={`nav-item ${pathname === "/mentores" ? "active" : ""}`} href="/mentores"><span className="nav-dot" />Mentores</Link>
          <Link className={`nav-item ${pathname === "/reservas" ? "active" : ""}`} href="/reservas"><span className="nav-dot" />Mis reservas</Link>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => void logout()}><span className="nav-dot" />Cerrar sesión</button>
          <div className="profile-chip"><div className="avatar">{name.slice(0, 2).toUpperCase()}</div><div><strong>{name}</strong><span>Mentee</span></div></div>
        </div>
      </aside>
      <section className="content-area">
        <header className="topbar"><div className="breadcrumb"><span>Inicio</span><b>/</b><strong>{pathname === "/reservas" ? "Mis reservas" : "Mentores disponibles"}</strong></div><span className="status-pill"><i /> Microsoft Bookings conectado</span></header>
        {children}
      </section>
    </main>
  );
}
