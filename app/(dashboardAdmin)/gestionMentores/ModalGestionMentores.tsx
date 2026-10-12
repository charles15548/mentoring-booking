"use client";

import "./ModalGestionMentores.css";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { Mentor, MentorFormData } from "./page";

type Props = {
  mentor: Mentor | null;
  onClose: () => void;
  onSave: (mentor: MentorFormData) => Promise<string>;
};

export default function ModalGestionMentores({
  mentor,
  onClose,
  onSave,
}: Props) {
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [resumen, setResumen] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [alert, setAlert] = useState<{
    type: "success" | "danger" | "warning";
    message: string;
  } | null>(null);

  useEffect(() => {
    setAlert(null);
    setGuardado(false);

    if (!mentor) {
      setNombres("");
      setApellidos("");
      setEmail("");
      setTelefono("");
      setEspecialidad("");
      setFotoUrl("");
      setResumen("");
      setActivo(true);
      return;
    }

    setNombres(mentor.nombres || mentor.name || "");
    setApellidos(mentor.apellidos || "");
    setEmail(mentor.email || "");
    setTelefono(mentor.telefono || "");
    setEspecialidad(mentor.especialidad || "");
    setFotoUrl(mentor.foto_url || "");
    setResumen(mentor.resumen || "");
    setActivo(mentor.activo);
  }, [mentor]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || guardado) {
      return;
    }

    setAlert(null);

    if (!nombres.trim() || !email.trim()) {
      setAlert({
        type: "warning",
        message: "Nombres y correo son obligatorios.",
      });
      return;
    }

    try {
      setSaving(true);

      const mensajeResultado = await onSave({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        especialidad: especialidad.trim(),
        foto_url: fotoUrl.trim(),
        resumen: resumen.trim(),
        activo,
      });

      const correoPendiente =
        !mentor && mensajeResultado.toLowerCase().includes("pendiente");

      setAlert({
        type: correoPendiente ? "warning" : "success",
        message: mensajeResultado,
      });

      setGuardado(true);

      closeTimeoutRef.current = setTimeout(
        () => {
          onClose();
        },
        correoPendiente ? 3500 : 2500,
      );
    } catch (error) {
      setAlert({
        type: "danger",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la información del mentor.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop mentor-modal-backdrop" role="presentation">
      <div
        className="booking-modal mentor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-gestion-mentor-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          disabled={saving}
          aria-label="Cerrar modal"
        >
          ×
        </button>

        <div className="mentor-modal-header">
          <p className="eyebrow">{mentor ? "EDITAR MENTOR" : "NUEVO MENTOR"}</p>

          <h2 id="modal-gestion-mentor-title">
            {mentor ? "Actualizar mentor" : "Registrar mentor"}
          </h2>

          {mentor && !mentor.tieneCuenta && (
            <p className="intro">
              Este mentor existe en Microsoft Bookings, pero todavía no tiene
              una cuenta vinculada en ProUni.
            </p>
          )}

          {!mentor && (
            <p className="intro">
              Registra los datos del mentor. Podrá establecer su propia
              contraseña mediante un enlace enviado a su correo electrónico.
            </p>
          )}
        </div>

        {alert && (
          <div
            className={`mentor-alert mentor-alert-${alert.type}`}
            role={alert.type === "danger" ? "alert" : "status"}
          >
            <span className="mentor-alert-icon" aria-hidden="true">
              {alert.type === "success"
                ? "✓"
                : alert.type === "warning"
                  ? "!"
                  : "×"}
            </span>

            <span>{alert.message}</span>
          </div>
        )}

        <form className="mentor-form" onSubmit={guardar}>
          <div className="mentor-form-grid">
            <div className="field">
              <label htmlFor="mentor-nombres">Nombres</label>

              <input
                id="mentor-nombres"
                value={nombres}
                onChange={(event) => setNombres(event.target.value)}
                autoComplete="given-name"
                disabled={saving || guardado}
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-apellidos">Apellidos</label>

              <input
                id="mentor-apellidos"
                value={apellidos}
                onChange={(event) => setApellidos(event.target.value)}
                autoComplete="family-name"
                disabled={saving || guardado}
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-email">Correo</label>

              <input
                id="mentor-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={saving || guardado}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-telefono">Teléfono</label>

              <input
                id="mentor-telefono"
                type="tel"
                value={telefono}
                onChange={(event) => setTelefono(event.target.value)}
                autoComplete="tel"
                disabled={saving || guardado}
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-especialidad">Especialidad</label>

              <input
                id="mentor-especialidad"
                value={especialidad}
                onChange={(event) => setEspecialidad(event.target.value)}
                placeholder="Ej. Gestión de proyectos"
                disabled={saving || guardado}
              />
            </div>

            <div className="field mentor-field-full">
              <label htmlFor="mentor-resumen">Resumen</label>

              <textarea
                id="mentor-resumen"
                className="mentor-resumen-textarea"
                value={resumen}
                onChange={(event) => setResumen(event.target.value)}
                placeholder="Breve descripción del mentor"
                rows={4}
                disabled={saving || guardado}
              />
            </div>
          </div>

          <div className="mentor-form-actions">
            {mentor?.tieneCuenta && (
              <label className="mentor-active-control">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(event) => setActivo(event.target.checked)}
                  disabled={saving || guardado}
                />
                Usuario activo
              </label>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={saving || guardado}
            >
              {saving
                ? "Guardando..."
                : guardado
                  ? "Guardado"
                  : mentor
                    ? "Guardar cambios"
                    : "Registrar mentor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
