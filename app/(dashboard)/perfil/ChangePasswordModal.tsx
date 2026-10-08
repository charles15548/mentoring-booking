"use client";

import { useEffect, useState } from "react";
import styles from "./perfil.module.css";

type ChangePasswordModalProps = {
  isOpen: boolean;
  saving: boolean;
  error?: string;
  success?: string;
  onClose: () => void;
  onConfirm: (currentPassword: string, newPassword: string) => void;
};

export default function ChangePasswordModal({
  isOpen,
  saving,
  error,
  success,
  onClose,
  onConfirm,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const passwordsMatch =
    confirmPassword.length === 0 || newPassword === confirmPassword;

  const hasMinimumLength = newPassword.length >= 8;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return;
    }

    if (!hasMinimumLength || newPassword !== confirmPassword) {
      return;
    }

    onConfirm(currentPassword, newPassword);
  }

  function close() {
    if (saving) {
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);

    onClose();
  }

  return (
    <div
      className={styles.passwordOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        className={styles.passwordModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className={styles.passwordHeader}>
          <div>
            <span className={styles.passwordEyebrow}>SEGURIDAD</span>

            <h2 id="change-password-title">Cambiar contraseña</h2>

            <p>
              Actualiza la contraseña que utilizas para acceder a tu cuenta.
            </p>
          </div>

          <button
            type="button"
            className={styles.passwordClose}
            onClick={close}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {error && (
          <div className={styles.passwordMessageError} role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className={styles.passwordMessageSuccess} role="status">
            {success}
          </div>
        )}

        {!success && (
          <form className={styles.passwordForm} onSubmit={submit}>
            <label>
              Contraseña actual
              <div className={styles.passwordInput}>
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={saving}
                />

                <button
                  type="button"
                  onClick={() => setShowCurrent((value) => !value)}
                  disabled={saving}
                  aria-label={
                    showCurrent ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showCurrent ? "Ocultar" : "Ver"}
                </button>
              </div>
            </label>

            <label>
              Nueva contraseña
              <div className={styles.passwordInput}>
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                />

                <button
                  type="button"
                  onClick={() => setShowNew((value) => !value)}
                  disabled={saving}
                  aria-label={
                    showNew ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showNew ? "Ocultar" : "Ver"}
                </button>
              </div>
              <small
                className={
                  newPassword.length > 0 && !hasMinimumLength
                    ? styles.passwordInvalid
                    : undefined
                }
              >
                Mínimo 8 caracteres.
              </small>
            </label>

            <label>
              Confirmar nueva contraseña
              <div className={styles.passwordInput}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                />

                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  disabled={saving}
                  aria-label={
                    showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showConfirm ? "Ocultar" : "Ver"}
                </button>
              </div>
              {!passwordsMatch && (
                <small className={styles.passwordInvalid}>
                  Las contraseñas no coinciden.
                </small>
              )}
            </label>

            <div className={styles.passwordActions}>
              <button
                type="button"
                className={styles.passwordCancel}
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
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  !hasMinimumLength ||
                  !passwordsMatch
                }
              >
                {saving ? "Actualizando..." : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
