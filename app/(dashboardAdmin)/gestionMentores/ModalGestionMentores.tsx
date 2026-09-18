"use client";

import {
  useEffect,
  useState,
} from "react";

import type { Mentor } from "./page";

type FormMentor = {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  activo: boolean;
  password?: string;
};

type Props = {
  mentor: Mentor | null;

  onClose: () => void;

  onSave: (
    mentor: FormMentor,
  ) => Promise<void>;
};

export default function ModalGestionMentores({
  mentor,
  onClose,
  onSave,
}: Props) {
  const [nombres, setNombres] =
    useState("");

  const [apellidos, setApellidos] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [telefono, setTelefono] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [activo, setActivo] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    if (!mentor) {
      setNombres("");
      setApellidos("");
      setEmail("");
      setTelefono("");
      setPassword("");
      setActivo(true);

      return;
    }

    /*
      Para mentores antiguos que existen
      solo en Bookings probablemente
      nombres/apellidos no estén separados.

      Usamos name como respaldo.
    */

    setNombres(
      mentor.nombres ||
        mentor.name ||
        "",
    );

    setApellidos(
      mentor.apellidos || "",
    );

    setEmail(
      mentor.email || "",
    );

    setTelefono(
      mentor.telefono || "",
    );

    setActivo(
      mentor.activo,
    );

    setPassword("");
  }, [mentor]);

  async function guardar() {
    if (
      !nombres.trim() ||
      !email.trim()
    ) {
      window.alert(
        "Nombres y correo son obligatorios.",
      );

      return;
    }

    if (
      !mentor &&
      password.length < 8
    ) {
      window.alert(
        "La contraseña debe tener mínimo 8 caracteres.",
      );

      return;
    }

    try {
      setSaving(true);

      await onSave({
        nombres:
          nombres.trim(),

        apellidos:
          apellidos.trim(),

        email:
          email.trim(),

        telefono:
          telefono.trim(),

        activo,

        password:
          mentor
            ? undefined
            : password,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">

      <div className="booking-modal">

        <button
          className="modal-close"
          onClick={onClose}
          disabled={saving}
        >
          ×
        </button>

        <p className="eyebrow">
          {mentor
            ? "EDITAR MENTOR"
            : "NUEVO MENTOR"}
        </p>

        <h2>
          {mentor
            ? "Actualizar mentor"
            : "Registrar mentor"}
        </h2>

        {mentor &&
          !mentor.tieneCuenta && (
            <p className="intro">
              Este mentor existe en
              Microsoft Bookings pero todavía
              no tiene una cuenta vinculada
              en Supabase.
            </p>
          )}

        <div className="field">
          <label>Nombres</label>

          <input
            value={nombres}
            onChange={(e) =>
              setNombres(
                e.target.value,
              )
            }
          />
        </div>

        <div className="field">
          <label>
            Apellidos
          </label>

          <input
            value={apellidos}
            onChange={(e) =>
              setApellidos(
                e.target.value,
              )
            }
          />
        </div>

        <div className="field">
          <label>Correo</label>

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value,
              )
            }
          />
        </div>

        <div className="field">
          <label>
            Teléfono
          </label>

          <input
            value={telefono}
            onChange={(e) =>
              setTelefono(
                e.target.value,
              )
            }
          />
        </div>

        {!mentor && (
          <div className="field">
            <label>
              Contraseña temporal
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value,
                )
              }
              placeholder="Mínimo 8 caracteres"
            />
          </div>
        )}

        {mentor?.tieneCuenta && (
          <label>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) =>
                setActivo(
                  e.target.checked,
                )
              }
            />

            Usuario activo
          </label>
        )}

        <button
          className="primary-button"
          disabled={saving}
          onClick={() =>
            void guardar()
          }
        >
          {saving
            ? "Guardando..."
            : mentor
              ? "Guardar cambios"
              : "Crear mentor"}
        </button>

      </div>
    </div>
  );
}