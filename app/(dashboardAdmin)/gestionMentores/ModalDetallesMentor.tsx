"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Mentor } from "./page";

type Props = { mentor: Mentor; onClose: () => void };
const vino = "#87151b";

const estilos: Record<string, CSSProperties> = {
  fondo: {
    position: "fixed", inset: 0, zIndex: 1000,
    backgroundColor: "rgba(16, 19, 28, 0.60)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "20px",
  },
  modal: {
    width: "100%", maxWidth: "650px", maxHeight: "90vh",
    overflowY: "auto", backgroundColor: "#fff", borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)", color: "#252525",
  },
  encabezado: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "24px 28px 18px", borderBottom: "1px solid #eee",
  },
  etiqueta: {
    margin: "0 0 6px", color: vino, fontSize: "11px",
    fontWeight: 800, letterSpacing: "0.7px",
  },
  titulo: { margin: 0, fontSize: "24px", fontWeight: 800 },
  cerrar: {
    background: "transparent", border: "none", fontSize: "28px",
    cursor: "pointer", color: "#666", lineHeight: 1,
  },
  contenido: { padding: "24px 28px" },
  perfil: {
    display: "flex", alignItems: "center", gap: "15px", marginBottom: "24px",
  },
  avatar: {
    width: "64px", height: "64px", borderRadius: "50%",
    objectFit: "cover", border: "2px solid #f0dede",
  },
  avatarPlaceholder: {
    width: "64px", height: "64px", borderRadius: "50%",
    background: "#f4e5e2", color: vino, display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 800,
  },
  nombre: { fontSize: "17px", fontWeight: 800, marginBottom: "5px" },
  subtitulo: { fontSize: "12px", color: "#777", overflowWrap: "anywhere" },
  seccionTitulo: {
    fontSize: "14px", fontWeight: 800, marginBottom: "16px", color: "#333",
  },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
  },
  gridAcademico: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "24px", alignItems: "start",
  },
  label: { display: "block", color: "#777", fontSize: "12px", marginBottom: "6px" },
  valor: { margin: 0, fontSize: "14px", fontWeight: 600, overflowWrap: "anywhere" },
  separador: { border: 0, borderTop: "1px solid #eee", margin: "24px 0" },
  resumen: {
    background: "#faf8f8", border: "1px solid #eee", borderRadius: "9px",
    padding: "14px", fontSize: "13px", lineHeight: 1.6,
    whiteSpace: "pre-wrap", overflowWrap: "anywhere",
  },
  pie: {
    padding: "16px 28px", borderTop: "1px solid #eee",
    display: "flex", justifyContent: "flex-end",
  },
  botonCerrar: {
    border: "none", background: vino, color: "#fff", padding: "11px 28px",
    borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
  },
};

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <span style={estilos.label}>{label}</span>
      <p style={estilos.valor}>{valor?.trim() || "No registrado"}</p>
    </div>
  );
}

export default function ModalDetallesMentor({ mentor, onClose }: Props) {
  useEffect(() => {
    function tecla(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose]);

  const nombreCompleto =
    [mentor.nombres, mentor.apellidos].filter(Boolean).join(" ") || mentor.name;
  const estadoCuenta = !mentor.tieneCuenta
    ? "Sin cuenta"
    : mentor.activo ? "Cuenta activa" : "Cuenta inactiva";

  return (
    <div
      style={estilos.fondo}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        style={estilos.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalles-mentor"
      >
        <header style={estilos.encabezado}>
          <div>
            <p style={estilos.etiqueta}>GESTIÓN DE MENTORES</p>
            <h2 id="titulo-detalles-mentor" style={estilos.titulo}>
              Detalles del mentor
            </h2>
          </div>
          <button
            type="button"
            style={estilos.cerrar}
            onClick={onClose}
            aria-label="Cerrar detalles"
          >
            ×
          </button>
        </header>
        <div style={estilos.contenido}>
          <div style={estilos.perfil}>
            {mentor.foto_url ? (
              <img
                src={mentor.foto_url}
                alt={`Foto de ${nombreCompleto}`}
                style={estilos.avatar}
              />
            ) : (
              <div style={estilos.avatarPlaceholder}>
                {mentor.nombres?.charAt(0)?.toUpperCase() || "M"}
              </div>
            )}
            <div>
              <div style={estilos.nombre}>{nombreCompleto}</div>
              <div style={estilos.subtitulo}>{mentor.email}</div>
            </div>
          </div>
          <h3 style={estilos.seccionTitulo}>Información personal</h3>
          <div style={estilos.grid}>
            <Campo label="Nombres" valor={mentor.nombres} />
            <Campo label="Apellidos" valor={mentor.apellidos} />
            <Campo label="Correo electrónico" valor={mentor.email} />
            <Campo label="Teléfono" valor={mentor.telefono} />
          </div>
          <hr style={estilos.separador} />
          <div style={estilos.gridAcademico}>
            <div>
              <h3 style={estilos.seccionTitulo}>Información académica</h3>
              <Campo label="Especialidad" valor={mentor.especialidad} />
            </div>
            <div>
              <h3 style={estilos.seccionTitulo}>Estado de la cuenta</h3>
              <Campo label="Estado" valor={estadoCuenta} />
            </div>
          </div>
          <div style={{ marginTop: "22px" }}>
            <span style={estilos.label}>Resumen</span>
            <div style={estilos.resumen}>
              {mentor.resumen?.trim() || "Sin resumen registrado."}
            </div>
          </div>
        </div>
        <footer style={estilos.pie}>
          <button type="button" style={estilos.botonCerrar} onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </section>
    </div>
  );
}
