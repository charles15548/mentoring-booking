"use client";

import { useState } from "react";
import styles from "./perfil.module.css";

type ChangeEmailModalProps = {
  isOpen: boolean;
  saving: boolean;
  error?: string;
  success?: string;
  currentEmail: string;
  onClose: () => void;
  onConfirm: (newEmail: string, currentPassword: string) => void;
};

export default function ChangeEmailModal({
  isOpen,
  saving,
  error,
  success,
  currentEmail,
  onClose,
  onConfirm,
}: ChangeEmailModalProps) {
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) {
    return null;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = newEmail.trim();

    if (!email || !currentPassword) {
      return;
    }

    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      return;
    }

    onConfirm(email, currentPassword);
  }

  function close() {
    if (saving) {
      return;
    }

    setNewEmail("");
    setCurrentPassword("");
    setShowPassword(false);

    onClose();
  }

  return (
    <div
      className={styles.emailOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        className={styles.emailModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-email-title"
      >
        {success ? (
          <div className={styles.emailSuccessContent}>
            <div className={styles.emailSuccessIcon}>✓</div>

            <h2>Correo actualizado</h2>

            <p>Tu correo electrónico se cambió correctamente.</p>

            <div className={styles.emailSuccessEmail}>
              <span>Nuevo correo</span>

              <strong>{currentEmail}</strong>
            </div>

            <button type="button" className="primary-button" onClick={close}>
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className={styles.emailHeader}>
              <div>
                <span className={styles.emailEyebrow}>CUENTA</span>

                <h2 id="change-email-title">Cambiar correo electrónico</h2>

                <p>
                  Verifica tu identidad para actualizar el correo de acceso a tu
                  cuenta.
                </p>
              </div>

              <button
                type="button"
                className={styles.emailClose}
                onClick={close}
                disabled={saving}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {error && (
              <div className={styles.emailMessageError} role="alert">
                {error}
              </div>
            )}

            <div className={styles.currentEmail}>
              <span>Correo actual</span>

              <strong>{currentEmail}</strong>
            </div>

            <form className={styles.emailForm} onSubmit={submit}>
              <label>
                Nuevo correo electrónico
                <input
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="nuevo@correo.com"
                  autoComplete="email"
                  disabled={saving}
                  required
                />
              </label>

              <label>
                Contraseña actual
                <div className={styles.passwordInput}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Ingresa tu contraseña actual"
                    autoComplete="current-password"
                    disabled={saving}
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={saving}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
                <small>
                  Necesitamos tu contraseña actual para confirmar que eres el
                  propietario de la cuenta.
                </small>
              </label>

              <div className={styles.emailActions}>
                <button
                  type="button"
                  className={styles.emailCancel}
                  onClick={close}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    saving ||
                    !newEmail.trim() ||
                    !currentPassword ||
                    newEmail.trim().toLowerCase() === currentEmail.toLowerCase()
                  }
                >
                  {saving ? "Actualizando..." : "Cambiar correo"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
