"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ProfilePhotoModal, { type PhotoChange } from "./ProfilePhotoModal";
import styles from "./perfil.module.css";
import ChangePasswordModal from "./ChangePasswordModal";
import ChangeEmailModal from "./ChangeEmailModal";

type Profile = {
  id: string;
  nombres: string;
  apellidos: string | null;
  email: string;
  telefono: string | null;
  especialidad: string | null;
  foto_url: string | null;
  resumen: string | null;
  rol: "mentee" | "mentor" | "coordinador";
};

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  async function requestProfile(method = "GET", body?: FormData) {
    const accessToken = await token();

    if (!accessToken) {
      throw new Error("Tu sesión ha finalizado. Ingresa nuevamente.");
    }

    const response = await fetch("/api/perfil", {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo procesar la solicitud.");
    }

    return data.profile as Profile;
  }

  useEffect(() => {
    void requestProfile()
      .then(setProfile)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(formData: FormData, successMessage: string) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const updatedProfile = await requestProfile("PATCH", formData);

      setProfile(updatedProfile);

      window.dispatchEvent(
        new CustomEvent("profile-updated", {
          detail: updatedProfile,
        }),
      );

      setMessage(successMessage);
      setPhotoModalOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void save(
      new FormData(event.currentTarget),
      "Tus datos se guardaron correctamente.",
    );
  }

  function changePhoto(change: PhotoChange) {
    const form = new FormData();

    if (change.file) {
      form.set("foto", change.file);
    }

    if (change.removeCurrent) {
      form.set("remove_photo", "true");
    }

    return save(
      form,
      change.removeCurrent
        ? "La foto fue eliminada."
        : "La foto fue actualizada.",
    );
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!profile?.email) {
      setPasswordError("No se encontró el correo de la cuenta.");
      return;
    }

    setChangingPassword(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("La contraseña actual no es correcta.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(
          updateError.message || "No se pudo actualizar la contraseña.",
        );
      }

      setPasswordSuccess("Tu contraseña se actualizó correctamente.");
    } catch (reason) {
      setPasswordError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setChangingPassword(false);
    }
  }

  async function changeEmail(newEmail: string, currentPassword: string) {
    if (!profile?.email) {
      setEmailError("No se encontró el correo de la cuenta.");
      return;
    }

    setChangingEmail(true);
    setEmailError("");
    setEmailSuccess("");

    try {
      // Verificar la contraseña actual antes de permitir el cambio.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("La contraseña actual no es correcta.");
      }

      const accessToken = await token();

      if (!accessToken) {
        throw new Error("Tu sesión ha finalizado. Ingresa nuevamente.");
      }

      // Actualizar el correo en Auth y profiles desde el servidor.
      const response = await fetch("/api/perfil/email", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cambiar el correo.");
      }

      const updatedProfile = {
        ...profile,
        email: data.email,
      };

      setProfile(updatedProfile);

      window.dispatchEvent(
        new CustomEvent("profile-updated", {
          detail: updatedProfile,
        }),
      );

      // El modal mostrará la pantalla de confirmación.
      // Se cerrará cuando el usuario pulse "Listo".
      setEmailSuccess("Tu correo electrónico se actualizó correctamente.");
    } catch (reason) {
      setEmailError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cambiar el correo.",
      );
    } finally {
      setChangingEmail(false);
    }
  }

  if (loading) {
    return <main className={styles.state}>Cargando perfil...</main>;
  }

  if (!profile) {
    return (
      <main className={styles.state}>
        {error || "No se encontró el perfil."}
      </main>
    );
  }

  const isAdmin = profile.rol === "coordinador";

  if (isAdmin) {
    return (
      <main className={`page-content ${styles.page}`}>
        <div className={styles.adminProfile}>
          <header className={styles.adminHeader}>
            <div>
              <span className={styles.adminEyebrow}>CUENTA</span>

              <h1>Mi Perfil</h1>

              <p>
                Administra tu información personal y los datos de tu cuenta.
              </p>
            </div>
          </header>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}

          <section className={styles.adminSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Información personal</h2>

                <p>Actualiza los datos que aparecen en tu cuenta.</p>
              </div>

              <span className={styles.adminRole}>Administrador</span>
            </div>

            <form className={styles.adminForm} onSubmit={submit}>
              <div className={styles.adminPhotoColumn}>
                {profile.foto_url ? (
                  <img
                    className={styles.adminPhoto}
                    src={profile.foto_url}
                    alt="Foto de perfil"
                  />
                ) : (
                  <div className={styles.adminPlaceholder}>
                    {profile.nombres.charAt(0).toUpperCase()}
                  </div>
                )}

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setPhotoModalOpen(true)}
                >
                  Cambiar foto
                </button>
              </div>

              <div className={styles.adminFields}>
                <label>
                  Nombres
                  <input
                    name="nombres"
                    required
                    defaultValue={profile.nombres}
                    maxLength={120}
                  />
                </label>

                <label>
                  Apellidos
                  <input
                    name="apellidos"
                    defaultValue={profile.apellidos ?? ""}
                    maxLength={120}
                  />
                </label>

                <label className={styles.adminFull}>
                  Correo electrónico
                  <div className={styles.emailField}>
                    <input value={profile.email} readOnly />

                    <button
                      type="button"
                      className={styles.emailChangeButton}
                      onClick={() => {
                        setEmailError("");
                        setEmailSuccess("");
                        setEmailModalOpen(true);
                      }}
                    >
                      Cambiar correo
                    </button>
                  </div>
                  <small>
                    Necesitarás tu contraseña actual para realizar el cambio.
                  </small>
                </label>

                <label className={styles.adminFull}>
                  Teléfono
                  <input
                    name="telefono"
                    type="tel"
                    defaultValue={profile.telefono ?? ""}
                    maxLength={30}
                  />
                </label>

                <div className={styles.adminActions}>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className={styles.adminSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Seguridad</h2>

                <p>Protege el acceso a tu cuenta.</p>
              </div>
            </div>

            <div className={styles.securityRow}>
              <div className={styles.securityIcon}>🔒</div>

              <div className={styles.securityInfo}>
                <strong>Contraseña</strong>

                <p>
                  Puedes actualizar la contraseña de tu cuenta cuando lo
                  necesites.
                </p>
              </div>

              <button
                type="button"
                className={styles.securityButton}
                onClick={() => {
                  setPasswordError("");
                  setPasswordSuccess("");
                  setPasswordModalOpen(true);
                }}
              >
                Cambiar contraseña
              </button>
            </div>
          </section>
        </div>

        <ProfilePhotoModal
          isOpen={photoModalOpen}
          currentPhotoUrl={profile.foto_url}
          saving={saving}
          onClose={() => setPhotoModalOpen(false)}
          onConfirm={changePhoto}
        />

        <ChangePasswordModal
          isOpen={passwordModalOpen}
          saving={changingPassword}
          error={passwordError}
          success={passwordSuccess}
          onClose={() => {
            setPasswordModalOpen(false);
            setPasswordError("");
            setPasswordSuccess("");
          }}
          onConfirm={changePassword}
        />

        <ChangeEmailModal
          isOpen={emailModalOpen}
          saving={changingEmail}
          error={emailError}
          success={emailSuccess}
          currentEmail={profile.email}
          onClose={() => {
            setEmailModalOpen(false);
            setEmailError("");
            setEmailSuccess("");
          }}
          onConfirm={changeEmail}
        />
      </main>
    );
  }

  return (
    <main className={`page-content ${styles.page}`}>
      <section
        className={`mentor-card ${styles.card}`}
        aria-labelledby="profile-heading"
      >
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}

        <div className={styles.photoRow}>
          {profile.foto_url ? (
            <img
              className={styles.photo}
              src={profile.foto_url}
              alt="Foto de perfil"
            />
          ) : (
            <div className={styles.placeholder}>
              {profile.nombres.charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <h2>Foto de perfil</h2>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setPhotoModalOpen(true)}
            >
              Cambiar foto
            </button>
          </div>
        </div>

        <form className={`login-form ${styles.form}`} onSubmit={submit}>
          <label>
            Nombres
            <input
              name="nombres"
              required
              defaultValue={profile.nombres}
              maxLength={120}
            />
          </label>

          <label>
            Apellidos
            <input
              name="apellidos"
              defaultValue={profile.apellidos ?? ""}
              maxLength={120}
            />
          </label>

          <label>
            Correo electrónico
            <input value={profile.email} readOnly />
          </label>

          <label>
            Teléfono
            <input
              name="telefono"
              type="tel"
              defaultValue={profile.telefono ?? ""}
              maxLength={30}
            />
          </label>

          <label className={styles.full}>
            Especialidad
            <input
              name="especialidad"
              defaultValue={profile.especialidad ?? ""}
              maxLength={160}
            />
          </label>

          <label className={styles.full}>
            Resumen
            <textarea
              name="resumen"
              defaultValue={profile.resumen ?? ""}
              maxLength={1200}
              rows={5}
            />
          </label>

          <div className={styles.actions}>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </section>

      <ProfilePhotoModal
        isOpen={photoModalOpen}
        currentPhotoUrl={profile.foto_url}
        saving={saving}
        onClose={() => setPhotoModalOpen(false)}
        onConfirm={changePhoto}
      />
    </main>
  );
}
