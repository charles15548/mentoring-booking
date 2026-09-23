"use client";

import "./MenteeLayout.css";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, signOut } from "@/services/auth.service";

export default function MenteeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [name, setName] = useState("Cargando...");
  const [rol, setRol] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await getCurrentProfile(data.user.id);

      if (!profile) {
        router.replace("/login");
        return;
      }

      setName(
        [profile.nombres, profile.apellidos].filter(Boolean).join(" ") ||
          profile.email ||
          "Usuario",
      );
      setRol(profile.rol);
    }

    void loadProfile();
  }, [router]);

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  function active(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <main className="app-shell mentee-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div>
            <strong>PROUNI</strong>
            <span>Mentorías</span>
          </div>
        </div>

        {rol === "mentee" && (
          <nav className="main-nav" aria-label="Navegación principal">
            <Link
              className={`nav-item ${active("/mentores") ? "active" : ""}`}
              href="/mentores"
            >
              <span className="nav-dot" />
              Mentores
            </Link>

            <Link
              className={`nav-item ${active("/reservas") ? "active" : ""}`}
              href="/reservas"
            >
              <span className="nav-dot" />
              Mis reservas
            </Link>
          </nav>
        )}

        {rol === "mentor" && (
          <nav className="main-nav" aria-label="Navegación principal">
            <Link
              className={`nav-item ${active("/horarios") ? "active" : ""}`}
              href="/horarios"
            >
              <span className="nav-dot" />
              Horarios
            </Link>
            <Link
              className={`nav-item ${active("/reservasMentor") ? "active" : ""}`}
              href="/reservasMentor"
            >
              <span className="nav-dot" />
              Mentorias
            </Link>
          </nav>
        )}

        {rol === "coordinador" && (
          <nav className="main-nav" aria-label="Navegación principal">
            <Link
              className={`nav-item ${pathname === "/coordinador" ? "active" : ""}`}
              href="/coordinador"
            >
              <span className="nav-dot" />
              Inicio
            </Link>

            <Link
              className={`nav-item ${active("/gestionMentores") ? "active" : ""}`}
              href="/gestionMentores"
            >
              <span className="nav-dot" />
              Gestión de mentores
            </Link>

            <Link
              className={`nav-item ${active("/gestionMentee") ? "active" : ""}`}
              href="/gestionMentee"
            >
              <span className="nav-dot" />
              Gestión de mentees
            </Link>
          </nav>
        )}

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => void logout()}>
            <span className="nav-dot" />
            Cerrar sesión
          </button>

          <div className="profile-chip">
            <div className="avatar">
              {name !== "Cargando..." ? name.slice(0, 2).toUpperCase() : "..."}
            </div>

            <div>
              <strong>{name}</strong>
              <span>{rol || "Cargando..."}</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <span />

          <span className="status-pill">
            <i />
            Microsoft Bookings conectado
          </span>
        </header>

        {children}
      </section>
    </main>
  );
}
