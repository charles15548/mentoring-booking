"use client";

import "./MenteeLayout.css";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  Box,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { getCurrentProfile, signOut } from "@/services/auth.service";

import ChangePasswordModal from "@/app/(dashboard)/perfil/ChangePasswordModal";

/* =====================================================
CONFIGURACIÓN DE MENÚS
===================================================== */

const menus = {
  mentee: [
    {
      href: "/perfil",
      label: "Mi Perfil",
      icon: UserRound,
    },
    {
      href: "/mentores",
      label: "Selección de Horarios",
      icon: Users,
    },
    {
      href: "/reservas",
      label: "Sesiones agendadas",
      icon: CalendarDays,
    },
    {
      href: "/mentoriasMentee",
      label: "Repositorio de Mentorías",
      icon: CheckCircle2,
    },
  ],

  mentor: [
    {
      href: "/perfil",
      label: "Mi Perfil",
      icon: UserRound,
    },
    {
      href: "/horarios",
      label: "Mis Horarios",
      icon: Clock3,
    },
    {
      href: "/reservasMentor",
      label: "Confirmar mentorías",
      icon: CalendarDays,
    },
    {
      href: "/mentorias",
      label: "Registro de mentorías",
      icon: CheckCircle2,
    },
    {
      href: "/evidencias",
      label: "Repositorio de evidencias",
      icon: FileCheck2,
    },
  ],

  coordinador: [
    {
      href: "/coordinador",
      label: "Inicio",
      icon: LayoutDashboard,
    },
    {
      href: "/perfil",
      label: "Mi Perfil",
      icon: UserRound,
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
    {
      href: "/asignacion",
      label: "Asignación mentor | mentee",
      icon: Box,
    },
    {
      href: "/acuerdos",
      label: "Repositorio de acuerdos",
      icon: FileCheck2,
    },
  ],
};

type AccessStatus = "loading" | "ready" | "required" | "error";

export default function MenteeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [name, setName] = useState("Cargando...");
  const [rol, setRol] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [accessStatus, setAccessStatus] = useState<AccessStatus>("loading");

  const [loadError, setLoadError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  /* =====================================================
  ACTUALIZAR PERFIL Y COMPROBAR PRIMER INGRESO
  ===================================================== */

  async function loadProfile() {
    try {
      setLoadError("");

      const { data, error: authError } = await supabase.auth.getUser();

      if (authError || !data.user) {
        setAccessStatus("loading");
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await getCurrentProfile(
        data.user.id,
      );

      if (profileError || !profile) {
        setLoadError("No se pudo comprobar el perfil. Vuelve a intentarlo.");
        setAccessStatus("error");
        return;
      }

      setName(
        [profile.nombres, profile.apellidos].filter(Boolean).join(" ") ||
          profile.email ||
          "Usuario",
      );

      setRol(profile.rol);
      setPhotoUrl(profile.foto_url);

      const requiereCambio =
        (profile.rol === "mentor" || profile.rol === "mentee") &&
        profile.debe_cambiar_password === true;

      setAccessStatus(requiereCambio ? "required" : "ready");
    } catch (error) {
      console.error("No se pudo cargar el perfil:", error);

      setLoadError("No se pudo comprobar tu cuenta. Vuelve a intentarlo.");

      setAccessStatus("error");
    }
  }

  /* =====================================================
  CARGA INICIAL + ACTUALIZACIÓN AUTOMÁTICA
  ===================================================== */

  useEffect(() => {
    void loadProfile();

    function handleProfileUpdated() {
      void loadProfile();
    }

    window.addEventListener("profile-updated", handleProfileUpdated);

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdated);
    };
  }, [router]);

  /* =====================================================
  CAMBIO INICIAL OBLIGATORIO
  ===================================================== */

  async function changeInitialPassword(
    _currentPassword: string,
    newPassword: string,
  ) {
    if (accessStatus !== "required" || changingPassword) {
      return;
    }

    setChangingPassword(true);
    setPasswordError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión ha finalizado. Inicia sesión nuevamente.");
      }

      const response = await fetch("/api/perfil/password-inicial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const result: {
        error?: string;
        debe_cambiar_password?: boolean;
      } = await response.json();

      if (!response.ok || result.debe_cambiar_password !== false) {
        throw new Error(
          result.error || "No se pudo completar el cambio de contraseña.",
        );
      }

      setAccessStatus("ready");

      window.dispatchEvent(new Event("profile-updated"));
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setChangingPassword(false);
    }
  }

  /* =====================================================
  CERRAR SESIÓN
  ===================================================== */

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  /* =====================================================
  RUTA ACTIVA
  ===================================================== */

  function active(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  /* =====================================================
  MENÚ SEGÚN ROL
  ===================================================== */

  const currentMenu = menus[rol as keyof typeof menus] ?? [];

  /* =====================================================
  TÍTULO AUTOMÁTICO
  ===================================================== */

  const currentTitle =
    currentMenu.find((item) => active(item.href))?.label ?? "";

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
    coordinador: "Admin",
  };

  return (
    <main className="app-shell mentee-shell">
      {/* SIDEBAR */}

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

        <nav className="main-nav" aria-label="Navegación principal">
          {accessStatus === "ready" &&
            currentMenu.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active(item.href) ? "active" : ""}`}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>

        {/* PARTE INFERIOR DEL SIDEBAR */}

        <div className="sidebar-bottom">
          <div className="prouni-logo">
            <Image
              src="/LogoProUni.jpg"
              alt="ProUni"
              width={140}
              height={50}
              className="prouni-logo-image"
            />
          </div>

          <button
            type="button"
            className="nav-item logout-item"
            onClick={() => void logout()}
          >
            <LogOut size={19} />
            <span>Salir</span>
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}

      <section className="content-area">
        <header className="topbar">
          <div className="topbar-page-info">
            <h1>{currentTitle}</h1>
          </div>

          <div className="topbar-actions">
            <div className="status-pill">
              <CheckCircle2 size={15} />
              <span>Microsoft Bookings conectado</span>
            </div>

            <div className="header-divider" />

            <div className="header-profile">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Foto de perfil"
                  className="avatar avatar-image"
                />
              ) : (
                <div className="avatar">{initials}</div>
              )}

              <div className="header-profile-info">
                <strong>{name}</strong>
                <span>{roleLabels[rol] ?? "Cargando..."}</span>
              </div>
            </div>
          </div>
        </header>

        {accessStatus === "ready" && children}

        {accessStatus === "loading" && (
          <p className="page-content">Verificando cuenta...</p>
        )}

        {accessStatus === "required" && (
          <p className="page-content">
            Establece tu contraseña personal para continuar.
          </p>
        )}

        {accessStatus === "error" && (
          <div className="page-content">
            <p role="alert">{loadError}</p>

            <button
              type="button"
              className="primary-button"
              onClick={() => void loadProfile()}
            >
              Reintentar
            </button>
          </div>
        )}
      </section>

      {/* CAMBIO OBLIGATORIO */}

      <ChangePasswordModal
        isOpen={accessStatus === "required"}
        initialChange
        saving={changingPassword}
        error={passwordError}
        onClose={() => {}}
        onConfirm={changeInitialPassword}
      />
    </main>
  );
}
