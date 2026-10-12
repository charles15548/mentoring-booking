"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import styles from "./perfil.module.css";

type ChangePasswordModalProps = {
  isOpen: boolean;
  saving: boolean;
  error?: string;
  success?: string;
  onClose: () => void;
  onConfirm: (currentPassword: string, newPassword: string) => void;
  initialChange?: boolean;
};

export default function ChangePasswordModal({
  isOpen,
  saving,
  error,
  success,
  onClose,
  onConfirm,
  initialChange = false,
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

  useEffect(() => {
    if (!isOpen || !initialChange) return;

    function preventEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("keydown", preventEscape, true);

    return () => {
      window.removeEventListener("keydown", preventEscape, true);
    };
  }, [isOpen, initialChange]);

  if (!isOpen) return null;

  const passwordsMatch =
    confirmPassword.length === 0 || newPassword === confirmPassword;

  const hasMinimumLength = newPassword.length >= 8;
  const hasMaximumLength = newPassword.length <= 128;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      (!initialChange && !currentPassword) ||
      !newPassword ||
      !confirmPassword
    ) {
      return;
    }

    if (
      !hasMinimumLength ||
      !hasMaximumLength ||
      newPassword !== confirmPassword
    ) {
      return;
    }

    onConfirm(initialChange ? "" : currentPassword, newPassword);
  }

  function close() {
    if (saving || initialChange) return;

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

            <h2 id="change-password-title">
              {initialChange
                ? "Establecer contraseña personal"
                : "Cambiar contraseña"}
            </h2>

            {!success && (
              <p>
                {initialChange
                  ? "Por seguridad, establece una contraseña personal para continuar. Este paso solo se realiza una vez."
                  : "Actualiza la contraseña que utilizas para acceder a tu cuenta."}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className={styles.passwordMessageError} role="alert">
            {error}
          </div>
        )}

        {success && (
          <>
            <div className={styles.passwordMessageSuccess} role="status">
              {success}
            </div>

            <div className={styles.passwordActions}>
              <button
                type="button"
                className="primary-button"
                onClick={close}
                disabled={saving}
              >
                Aceptar
              </button>
            </div>
          </>
        )}

        {!success && (
          <form className={styles.passwordForm} onSubmit={submit}>
            {!initialChange && (
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
            )}

            <label>
              Nueva contraseña
              <div className={styles.passwordInput}>
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                  maxLength={128}
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
                  newPassword.length > 0 &&
                  (!hasMinimumLength || !hasMaximumLength)
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
                  maxLength={128}
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
              {!initialChange && (
                <button
                  type="button"
                  className={styles.passwordCancel}
                  onClick={close}
                  disabled={saving}
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving ||
                  (!initialChange && !currentPassword) ||
                  !newPassword ||
                  !confirmPassword ||
                  !hasMinimumLength ||
                  !hasMaximumLength ||
                  !passwordsMatch
                }
              >
                {saving
                  ? "Actualizando..."
                  : initialChange
                    ? "Guardar y continuar"
                    : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
