"use client";

import "./ModalGestionMentores.css";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { Mentor, MentorFormData } from "./page";

type Props = {
  mentor: Mentor | null;
  onClose: () => void;
  onSave: (mentor: MentorFormData) => Promise<void>;
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
  const [password, setPassword] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mentor) {
      setNombres("");
      setApellidos("");
      setEmail("");
      setTelefono("");
      setEspecialidad("");
      setFotoUrl("");
      setResumen("");
      setPassword("");
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
    setPassword("");
  }, [mentor]);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!nombres.trim() || !email.trim()) {
      window.alert("Nombres y correo son obligatorios.");
      return;
    }

    if (!mentor && password.length < 8) {
      window.alert("La contraseña debe tener mínimo 8 caracteres.");
      return;
    }

    try {
      setSaving(true);

      await onSave({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        especialidad: especialidad.trim(),
        foto_url: fotoUrl.trim(),
        resumen: resumen.trim(),
        activo,
        password: mentor ? undefined : password,
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
          <p className="eyebrow">
            {mentor ? "EDITAR MENTOR" : "NUEVO MENTOR"}
          </p>

          <h2 id="modal-gestion-mentor-title">
            {mentor ? "Actualizar mentor" : "Registrar mentor"}
          </h2>

          {mentor && !mentor.tieneCuenta && (
            <p className="intro">
              Este mentor existe en Microsoft Bookings, pero todavía no tiene
              una cuenta vinculada en Supabase.
            </p>
          )}
        </div>

        <form className="mentor-form" onSubmit={guardar}>
          <div className="mentor-form-grid">
            <div className="field">
              <label htmlFor="mentor-nombres">Nombres</label>
              <input
                id="mentor-nombres"
                value={nombres}
                onChange={(event) => setNombres(event.target.value)}
                autoComplete="given-name"
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-apellidos">Apellidos</label>
              <input
                id="mentor-apellidos"
                value={apellidos}
                onChange={(event) => setApellidos(event.target.value)}
                autoComplete="family-name"
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
              />
            </div>

            <div className="field">
              <label htmlFor="mentor-especialidad">Especialidad</label>
              <input
                id="mentor-especialidad"
                value={especialidad}
                onChange={(event) => setEspecialidad(event.target.value)}
                placeholder="Ej. Gestión de proyectos"
                disabled={saving}
              />
            </div>

            {/* <div className="field">
              <label htmlFor="mentor-foto-url">URL de la foto</label>
              <input
                id="mentor-foto-url"
                type="url"
                value={fotoUrl}
                onChange={(event) => setFotoUrl(event.target.value)}
                placeholder="https://..."
                autoComplete="url"
                disabled={saving}
              />
            </div> */}

            <div className="field mentor-field-full">
              <label htmlFor="mentor-resumen">Resumen</label>
              <textarea
                id="mentor-resumen"
                className="mentor-resumen-textarea"
                value={resumen}
                onChange={(event) => setResumen(event.target.value)}
                placeholder="Breve descripción del mentor"
                rows={4}
                disabled={saving}
              />
            </div>

            {!mentor && (
              <div className="field">
                <label htmlFor="mentor-password">Contraseña temporal</label>
                <input
                  id="mentor-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={saving}
                />
              </div>
            )}
          </div>

          <div className="mentor-form-actions">
            {mentor?.tieneCuenta && (
              <label className="mentor-active-control">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(event) => setActivo(event.target.checked)}
                  disabled={saving}
                />
                Usuario activo
              </label>
            )}

            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Guardando..."
                : mentor
                  ? "Guardar cambios"
                  : "Crear mentor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
