"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./mentor-agreements.module.css";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: "pendiente" | "en_progreso" | "cumplido" | "cancelado";
  fecha_limite: string | null;
};

const statusLabels: Record<Agreement["estado"], string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

export default function MentorAgreements({ bookingId }: { bookingId: string }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [observation, setObservation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAgreements();
  }, [bookingId]);

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function request(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error("No se encontró la sesión activa.");
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }

  async function loadAgreements() {
    try {
      setLoading(true);
      setError("");
      setAgreements(
        await request(
          `/api/mentors/acuerdos?bookingId=${encodeURIComponent(bookingId)}`,
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los acuerdos.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      const agreement = await request("/api/mentors/acuerdos", {
        method: "POST",
        body: JSON.stringify({
          bookingId,
          titulo: title,
          descripcion: description,
          observacion: observation,
          fecha_limite: dueDate,
        }),
      });
      setAgreements((current) => [...current, agreement]);
      setTitle("");
      setDescription("");
      setObservation("");
      setDueDate("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo crear el acuerdo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, estado: Agreement["estado"]) {
    try {
      setError("");
      const agreement = await request("/api/mentors/acuerdos", {
        method: "PATCH",
        body: JSON.stringify({ id, estado }),
      });
      setAgreements((current) =>
        current.map((item) => (item.id === id ? agreement : item)),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el acuerdo.",
      );
    }
  }

  async function deleteAgreement(id: string) {
    if (!window.confirm("¿Eliminar este acuerdo?")) return;
    try {
      setError("");
      await request(`/api/mentors/acuerdos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setAgreements((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el acuerdo.",
      );
    }
  }

  return (
    <main className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MENTORÍA REALIZADA</p>
          <h1>Acuerdos</h1>
          <p className="intro">
            Registra los compromisos acordados durante esta sesión y realiza su
            seguimiento.
          </p>
        </div>
      </section>
      <Link className={styles.backLink} href="/mentorias">
        ← Volver a Mentorías
      </Link>
      {error && <p className="form-error">{error}</p>}
      <section className={`reservation-card ${styles.formCard}`}>
        <h2>Registrar acuerdo</h2>
        <form onSubmit={createAgreement} className={styles.form}>
          <label className={`${styles.field} ${styles.wideField}`}>
            Título del acuerdo
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej.: Leer el libro recomendado"
              required
            />
          </label>
          <label className={`${styles.field} ${styles.wideField}`}>
            Descripción
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripción del compromiso"
              rows={3}
            />
          </label>
          <label className={styles.field}>
            Observación
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Cómo se revisará"
              rows={2}
            />
          </label>
          <label className={styles.field}>
            Fecha límite
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <button
            className={styles.submitButton}
            type="submit"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Agregar acuerdo"}
          </button>
        </form>
      </section>
      {loading ? (
        <div className="empty-state">
          <h2>Cargando acuerdos...</h2>
        </div>
      ) : agreements.length === 0 ? (
        <div className="empty-state">
          <h2>Aún no hay acuerdos registrados</h2>
          <p>Registra los compromisos definidos en esta mentoría.</p>
        </div>
      ) : (
        <section className="reservation-list">
          {agreements.map((agreement) => (
            <article className="reservation-card" key={agreement.id}>
              <div>
                <p className="eyebrow">{statusLabels[agreement.estado]}</p>
                <h2>{agreement.titulo}</h2>
                {agreement.descripcion && <p>{agreement.descripcion}</p>}
                {agreement.observacion && (
                  <p>
                    <strong>Observación:</strong> {agreement.observacion}
                  </p>
                )}
                {agreement.fecha_limite && (
                  <p>
                    <strong>Fecha límite:</strong>{" "}
                    {new Date(
                      `${agreement.fecha_limite}T00:00:00`,
                    ).toLocaleDateString("es-PE")}
                  </p>
                )}
              </div>
              <div className={styles.agreementActions}>
                <label className={styles.statusControl}>
                  Estado
                  <select
                    value={agreement.estado}
                    onChange={(event) =>
                      updateStatus(
                        agreement.id,
                        event.target.value as Agreement["estado"],
                      )
                    }
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={styles.deleteButton}
                  type="button"
                  onClick={() => deleteAgreement(agreement.id)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
