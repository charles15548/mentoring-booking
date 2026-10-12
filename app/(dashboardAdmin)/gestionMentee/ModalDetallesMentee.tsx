
"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Mentee } from "./page";

type Props = {
  mentee: Mentee;
  onClose: () => void;
};

const vino = "#87151b";

const estilos: Record<string, CSSProperties> = {
  fondo: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    backgroundColor: "rgba(16, 19, 28, 0.60)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },

  modal: {
    width: "100%",
    maxWidth: "650px",
    maxHeight: "90vh",
    overflowY: "auto",
    backgroundColor: "#fff",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    color: "#252525",
  },

  encabezado: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "24px 28px 18px",
    borderBottom: "1px solid #eee",
  },

  etiqueta: {
    margin: "0 0 6px",
    color: vino,
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.7px",
  },

  titulo: {
    margin: 0,
    fontSize: "24px",
    fontWeight: 800,
  },

  cerrar: {
    background: "transparent",
    border: "none",
    fontSize: "28px",
    cursor: "pointer",
    color: "#666",
    lineHeight: 1,
  },

  contenido: {
    padding: "24px 28px",
  },

  perfil: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "24px",
  },

  avatar: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid #f0dede",
  },

  avatarPlaceholder: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#f4e5e2",
    color: vino,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: 800,
  },

  nombre: {
    fontSize: "17px",
    fontWeight: 800,
    marginBottom: "5px",
  },

  subtitulo: {
    fontSize: "12px",
    color: "#777",
    overflowWrap: "anywhere",
  },

  seccionTitulo: {
    fontSize: "14px",
    fontWeight: 800,
    marginBottom: "16px",
    color: "#333",
  },

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
  },

  gridAcademico: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "24px",
    alignItems: "start",
  },

  label: {
    display: "block",
    color: "#777",
    fontSize: "12px",
    marginBottom: "6px",
  },

  valor: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 600,
    overflowWrap: "anywhere",
  },

  separador: {
    border: 0,
    borderTop: "1px solid #eee",
    margin: "24px 0",
  },

  resumen: {
    background: "#faf8f8",
    border: "1px solid #eee",
    borderRadius: "9px",
    padding: "14px",
    fontSize: "13px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },

  pie: {
    padding: "16px 28px",
    borderTop: "1px solid #eee",
    display: "flex",
    justifyContent: "flex-end",
  },

  botonCerrar: {
    border: "none",
    background: vino,
    color: "#fff",
    padding: "11px 28px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

function Campo({
  label,
  valor,
}: {
  label: string;
  valor?: string | null;
}) {
  return (
    <div>
      <span style={estilos.label}>
        {label}
      </span>

      <p style={estilos.valor}>
        {valor?.trim() || "No registrado"}
      </p>
    </div>
  );
}

export default function ModalDetallesMentee({
  mentee,
  onClose,
}: Props) {
  useEffect(() => {
    function manejarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener(
      "keydown",
      manejarTecla,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        manejarTecla,
      );
    };
  }, [onClose]);

  const nombreCompleto =
    [mentee.nombres, mentee.apellidos]
      .filter(Boolean)
      .join(" ") || mentee.name;

  const estadoCuenta = !mentee.tieneCuenta
    ? "Sin cuenta"
    : mentee.activo
      ? "Cuenta activa"
      : "Cuenta inactiva";

  return (
    <div
      style={estilos.fondo}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        style={estilos.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalles-mentee"
      >
        {/* ENCABEZADO */}

        <header style={estilos.encabezado}>
          <div>
            <p style={estilos.etiqueta}>
              GESTIÓN DE MENTEES
            </p>

            <h2
              id="titulo-detalles-mentee"
              style={estilos.titulo}
            >
              Detalles del mentee
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
          {/* PERFIL */}

          <div style={estilos.perfil}>
            {mentee.foto_url ? (
              <img
                src={mentee.foto_url}
                alt={`Foto de ${nombreCompleto}`}
                style={estilos.avatar}
              />
            ) : (
              <div style={estilos.avatarPlaceholder}>
                {mentee.nombres
                  ?.charAt(0)
                  ?.toUpperCase() || "M"}
              </div>
            )}

            <div>
              <div style={estilos.nombre}>
                {nombreCompleto}
              </div>

              <div style={estilos.subtitulo}>
                {mentee.email}
              </div>
            </div>
          </div>

          {/* INFORMACIÓN PERSONAL */}

          <h3 style={estilos.seccionTitulo}>
            Información personal
          </h3>

          <div style={estilos.grid}>
            <Campo
              label="Nombres"
              valor={mentee.nombres}
            />

            <Campo
              label="Apellidos"
              valor={mentee.apellidos}
            />

            <Campo
              label="Correo electrónico"
              valor={mentee.email}
            />

            <Campo
              label="Teléfono"
              valor={mentee.telefono}
            />
          </div>

          <hr style={estilos.separador} />

          {/* INFORMACIÓN ACADÉMICA Y ESTADO */}

          <div style={estilos.gridAcademico}>
            <div>
              <h3 style={estilos.seccionTitulo}>
                Información académica
              </h3>

              <Campo
                label="Especialidad"
                valor={mentee.especialidad}
              />
            </div>

            <div>
              <h3 style={estilos.seccionTitulo}>
                Estado de la cuenta
              </h3>

              <Campo
                label="Estado"
                valor={estadoCuenta}
              />
            </div>
          </div>

          {/* RESUMEN */}

          <div style={{ marginTop: "22px" }}>
            <span style={estilos.label}>
              Resumen
            </span>

            <div style={estilos.resumen}>
              {mentee.resumen?.trim() ||
                "Sin resumen registrado."}
            </div>
          </div>
        </div>

        {/* PIE */}

        <footer style={estilos.pie}>
          <button
            type="button"
            style={estilos.botonCerrar}
            onClick={onClose}
          >
            Cerrar
          </button>
        </footer>
      </section>
    </div>
  );
}
