"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentProfile, signOut } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

export default function MenteeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div>
            <strong>PROUNI</strong>
            <span>Mentorías</span>
          </div>
        </div>

        {/* MENÚ MENTEE */}
        {rol === "mentee" && (
          <nav className="main-nav" aria-label="Navegación principal">
            <Link
              className={`nav-item ${
                pathname === "/mentores" ? "active" : ""
              }`}
              href="/mentores"
            >
              <span className="nav-dot" />
              Mentores
            </Link>

            <Link
              className={`nav-item ${
                pathname === "/reservas" ? "active" : ""
              }`}
              href="/reservas"
            >
              <span className="nav-dot" />
              Mis reservas
            </Link>
          </nav>
        )}

        {/* MENÚ MENTOR */}
        {rol === "mentor" && (
          <nav className="main-nav" aria-label="Navegación principal">
        

            {/* <Link
              className={`nav-item ${
                pathname === "/mentor/reservas" ? "active" : ""
              }`}
              href="/mentor/reservas"
            >
              <span className="nav-dot" />
              Mis mentorías
            </Link> */}

            <Link
              className={`nav-item ${
                pathname === "/horarios" ? "active" : ""
              }`}
              href="/horarios"
            >
              <span className="nav-dot"/>
              Horarios
            </Link>
          </nav>
        )}

        {/* MENÚ COORDINADOR */}
        {rol === "coordinador" && (
          <nav className="main-nav" aria-label="Navegación principal">
            <Link
              className={`nav-item ${
                pathname === "/coordinador" ? "active" : ""
              }`}
              href="/coordinador"
            >
              <span className="nav-dot" />
              Inicio
            </Link>

            <Link
              className={`nav-item ${
                pathname === "/gestionMentores" ? "active" : ""
              }`}
              href="/gestionMentores/"
            >
              <span className="nav-dot" />
              Gestión de mentores
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
              {name !== "Cargando..."
                ? name.slice(0, 2).toUpperCase()
                : "..."}
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
          <div className="breadcrumb">
            <span>Inicio</span>
            <b>/</b>

            <strong>
              {pathname === "/reservas"
                ? "Mis reservas"
                : pathname === "/mentores"
                  ? "Mentores disponibles"
                  : pathname.startsWith("/mentor")
                    ? "Panel de mentor"
                    : pathname.startsWith("/coordinador")
                      ? "Panel de coordinador"
                      : "Inicio"}
            </strong>
          </div>

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