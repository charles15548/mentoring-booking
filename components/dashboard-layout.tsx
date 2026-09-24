"use client";

import "./MenteeLayout.css";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  LogOut,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { getCurrentProfile, signOut } from "@/services/auth.service";

/* =====================================================
   CONFIGURACIÓN DE MENÚS
===================================================== */

const menus = {
  mentee: [
    {
      href: "/perfil",
      label: "Perfil",
      icon: UserRound,
    },
    {
      href: "/mentores",
      label: "Mentores",
      icon: Users,
    },
    {
      href: "/reservas",
      label: "Mis reservas",
      icon: CalendarDays,
    },
  ],

  mentor: [
    {
      href: "/perfil",
      label: "Perfil",
      icon: UserRound,
    },
    {
      href: "/horarios",
      label: "Horarios",
      icon: Clock3,
    },
    {
      href: "/reservasMentor",
      label: "Mentorías",
      icon: CalendarDays,
    },
  ],

  coordinador: [
    {
      href: "/coordinador",
      label: "Inicio",
      icon: LayoutDashboard,
    },
    {
      href: "/gestionMentores",
      label: "Gestión de mentores",
      icon: UserCog,
    },
    {
      href: "/gestionMentee",
      label: "Gestión de mentees",
      icon: Users,
    },
  ],
};

export default function MenteeLayout({
  children,
}: {
  children: ReactNode;
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

      const { data: profile } = await getCurrentProfile(
        data.user.id,
      );

      if (!profile) {
        router.replace("/login");
        return;
      }

      setName(
        [profile.nombres, profile.apellidos]
          .filter(Boolean)
          .join(" ") ||
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
    return (
      pathname === path ||
      pathname.startsWith(`${path}/`)
    );
  }

  /* =====================================================
     MENÚ SEGÚN ROL
  ===================================================== */

  const currentMenu =
    menus[rol as keyof typeof menus] ?? [];

  /* =====================================================
     TÍTULO AUTOMÁTICO
     Toma directamente el label de la ruta activa
  ===================================================== */

  const currentTitle =
    currentMenu.find((item) =>
      active(item.href),
    )?.label ?? "";

  /* =====================================================
     INICIALES
  ===================================================== */

  const initials =
    name !== "Cargando..."
      ? name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join("")
          .toUpperCase()
      : "...";

  /* =====================================================
     NOMBRE DEL ROL
  ===================================================== */

  const roleLabels: Record<string, string> = {
    mentee: "Mentee",
    mentor: "Mentor",
    coordinador: "Coordinador",
  };

  return (
    <main className="app-shell mentee-shell">
      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside className="sidebar">
        <div className="brand-lockup">
          <Image
            src="/logoPrincipal.jpeg"
            alt="Logo"
            width={180}
            height={60}
            className="brand-logo"
            priority
          />
        </div>

        {/* MENÚ AUTOMÁTICO */}

        <nav
          className="main-nav"
          aria-label="Navegación principal"
        >
          {currentMenu.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${
                  active(item.href) ? "active" : ""
                }`}
              >
                <Icon size={19} />

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* CERRAR SESIÓN */}

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item logout-item"
            onClick={() => void logout()}
          >
            <LogOut size={19} />

            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* =================================================
          CONTENIDO
      ================================================= */}

      <section className="content-area">
        <header className="topbar">
          {/* TÍTULO AUTOMÁTICO */}

          <div className="topbar-page-info">
            <h1>{currentTitle}</h1>
          </div>

          {/* DERECHA */}

          <div className="topbar-actions">
            <div className="status-pill">
              <CheckCircle2 size={15} />

              <span>
                Microsoft Bookings conectado
              </span>
            </div>

            <div className="header-divider" />

            <div className="header-profile">
              <div className="avatar">
                {initials}
              </div>

              <div className="header-profile-info">
                <strong>{name}</strong>

                <span>
                  {roleLabels[rol] ??
                    "Cargando..."}
                </span>
              </div>
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}