"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ProfilePhotoModal, { type PhotoChange } from "./ProfilePhotoModal";
import styles from "./perfil.module.css";

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

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function requestProfile(method = "GET", body?: FormData) {
    const accessToken = await token();
    if (!accessToken)
      throw new Error("Tu sesión ha finalizado. Ingresa nuevamente.");
    const response = await fetch("/api/perfil", {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo procesar la solicitud.");
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
      setProfile(await requestProfile("PATCH", formData));
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
    if (change.file) form.set("foto", change.file);
    if (change.removeCurrent) form.set("remove_photo", "true");
    return save(
      form,
      change.removeCurrent
        ? "La foto fue eliminada."
        : "La foto fue actualizada.",
    );
  }

  if (loading) return <main className={styles.state}>Cargando perfil...</main>;
  if (!profile)
    return (
      <main className={styles.state}>
        {error || "No se encontró el perfil."}
      </main>
    );

  return (
    <main className={`page-content ${styles.page}`}>
      <section className={`mentor-card ${styles.card}`} aria-labelledby="profile-heading">
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
