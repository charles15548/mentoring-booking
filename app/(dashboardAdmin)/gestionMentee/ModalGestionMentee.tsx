"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { Mentee, MenteeFormData } from "./page";

type Props = {
  mentee: Mentee | null;
  onClose: () => void;
  onSave: (mentee: MenteeFormData) => Promise<void>;
};
import "./ModalGestionMentee.css";
export default function ModalGestionMentee({
  mentee,
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
    if (!mentee) {
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

    /*
      Los mentees antiguos que existen solamente en Bookings pueden
      no tener nombres y apellidos separados. Se utiliza name como
      respaldo hasta que el coordinador complete sus datos.
    */
    setNombres(mentee.nombres || mentee.name || "");
    setApellidos(mentee.apellidos || "");
    setEmail(mentee.email || "");
    setTelefono(mentee.telefono || "");
    setEspecialidad(mentee.especialidad || "");
    setFotoUrl(mentee.foto_url || "");
    setResumen(mentee.resumen || "");
    setActivo(mentee.activo);
    setPassword("");
  }, [mentee]);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!nombres.trim() || !email.trim()) {
      window.alert("Nombres y correo son obligatorios.");
      return;
    }

    if (!mentee && password.length < 8) {
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
        password: mentee ? undefined : password,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop mentee-modal-backdrop"
      role="presentation"
    >
      <div
        className="booking-modal mentee-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-gestion-mentee-title"
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

        <div className="mentee-modal-header">
          <p className="eyebrow">
            {mentee ? "EDITAR MENTEE" : "NUEVO MENTEE"}
          </p>

          <h2 id="modal-gestion-mentee-title">
            {mentee ? "Actualizar mentee" : "Registrar mentee"}
          </h2>

          {mentee && !mentee.tieneCuenta && (
            <p className="intro">
              Este mentee existe en Microsoft Bookings, pero todavía no tiene
              una cuenta vinculada en Supabase.
            </p>
          )}
        </div>

        <form className="mentee-form" onSubmit={guardar}>
          <div className="mentee-form-grid">
            <div className="field">
            <label htmlFor="mentee-nombres">Nombres</label>

            <input
              id="mentee-nombres"
              value={nombres}
              onChange={(event) => setNombres(event.target.value)}
              autoComplete="given-name"
              disabled={saving}
              autoFocus
            />
            </div>

            <div className="field">
            <label htmlFor="mentee-apellidos">Apellidos</label>

            <input
              id="mentee-apellidos"
              value={apellidos}
              onChange={(event) => setApellidos(event.target.value)}
              autoComplete="family-name"
              disabled={saving}
            />
            </div>

            <div className="field">
            <label htmlFor="mentee-email">Correo</label>

            <input
              id="mentee-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={saving}
            />
            </div>

            <div className="field">
            <label htmlFor="mentee-telefono">Teléfono</label>

            <input
              id="mentee-telefono"
              type="tel"
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              autoComplete="tel"
              disabled={saving}
            />
            </div>

            <div className="field">
            <label htmlFor="mentee-especialidad">Especialidad</label>

            <input
              id="mentee-especialidad"
              value={especialidad}
              onChange={(event) => setEspecialidad(event.target.value)}
              placeholder="Ej. Ingeniería de Sistemas"
              disabled={saving}
            />
            </div>

            {/* <div className="field">
            <label htmlFor="mentee-foto-url">URL de la foto</label>

            <input
              id="mentee-foto-url"
              type="url"
              value={fotoUrl}
              onChange={(event) => setFotoUrl(event.target.value)}
              placeholder="https://..."
              autoComplete="url"
              disabled={saving}
            />
            </div> */}

            <div className="field mentee-field-full">
            <label htmlFor="mentee-resumen">Resumen</label>

            <textarea
              id="mentee-resumen"
              value={resumen}
              className="mentee-resumen-textarea"
              onChange={(event) => setResumen(event.target.value)}
              placeholder="Breve descripción del mentee"
              rows={4}
              disabled={saving}
            />
            </div>

            {!mentee && (
              <div className="field">
              <label htmlFor="mentee-password">Contraseña temporal</label>

              <input
                id="mentee-password"
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

          <div className="mentee-form-actions">
            {mentee?.tieneCuenta && (
              <label className="mentee-active-control">
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
                : mentee
                  ? "Guardar cambios"
                  : "Crear mentee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
