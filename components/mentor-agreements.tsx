"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import AgreementResourcePreview from "./agreement-resource-preview";
import styles from "./mentor-agreements-detail.module.css";

type AgreementStatus = "pendiente" | "en_progreso" | "cumplido" | "cancelado";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: AgreementStatus;
  fecha_limite: string | null;
  enlaces: string[];
};

const statusLabels: Record<AgreementStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

const MAX_LINKS = 10;

/* =========================================================
   NORMALIZAR IDENTIFICADOR DE MICROSOFT BOOKINGS
   ========================================================= */

function normalizeBookingId(value: string) {
  const trimmed = value.trim();

  // Next.js normalmente entrega el parámetro decodificado.
  // Si aún contiene secuencias URL (%3D, %2F, etc.),
  // decodificamos una vez más.
  if (!/%[0-9a-fA-F]{2}/.test(trimmed)) {
    return trimmed;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/* =========================================================
   VALIDACIÓN DE ENLACES
   ========================================================= */

function normalizeLink(value: string): string | null {
  try {
    const parsed = new URL(value.trim());

    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      return null;
    }

    if (value.trim().length > 2048) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/* =========================================================
   COMPONENTE
   ========================================================= */

export default function MentorAgreements({ bookingId }: { bookingId: string }) {
  const normalizedBookingId = normalizeBookingId(bookingId);

  const [agreements, setAgreements] = useState<Agreement[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [observation, setObservation] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceLinks, setResourceLinks] = useState<string[]>([]);
  const [resourceError, setResourceError] = useState("");

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAgreements();
  }, [normalizedBookingId]);

  /* =========================================================
     AUTENTICACIÓN
     ========================================================= */

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token;
  }

  async function request(path: string, init?: RequestInit) {
    const accessToken = await token();

    if (!accessToken) {
      throw new Error("No se encontró la sesión activa.");
    }

    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo completar la operación.");
    }

    return data;
  }

  /* =========================================================
     CONSULTAR ACUERDOS
     ========================================================= */

  async function loadAgreements() {
    try {
      setLoading(true);
      setError("");
      setLoadError("");

      const url = `/api/mentors/acuerdos?bookingId=${encodeURIComponent(
        normalizedBookingId,
      )}`;

      const data: Agreement[] = await request(url);

      if (!Array.isArray(data)) {
        throw new Error(
          "La respuesta de acuerdos no tiene el formato esperado.",
        );
      }

      setAgreements(
        data.map((item) => ({
          ...item,
          enlaces: Array.isArray(item.enlaces) ? item.enlaces : [],
        })),
      );
    } catch (loadError) {
      setAgreements([]);

      setLoadError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los acuerdos.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     AGREGAR RECURSO DE REFERENCIA
     ========================================================= */

  function addResource() {
    setResourceError("");

    const normalized = normalizeLink(resourceUrl);

    if (!normalized) {
      setResourceError(
        "Ingresa un enlace válido que comience con https:// o http://.",
      );
      return;
    }

    if (resourceLinks.length >= MAX_LINKS) {
      setResourceError("Puedes agregar hasta 10 enlaces por acuerdo.");
      return;
    }

    if (resourceLinks.includes(normalized)) {
      setResourceError("Este enlace ya fue agregado.");
      return;
    }

    setResourceLinks((current) => [...current, normalized]);

    setResourceUrl("");
  }

  function removeResource(url: string) {
    setResourceLinks((current) => current.filter((item) => item !== url));

    setResourceError("");
  }

  /* =========================================================
     CREAR ACUERDO
     ========================================================= */

  async function createAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resourceUrl.trim()) {
      setResourceError(
        "Tienes un enlace sin agregar. Pulsa «Agregar enlace» antes de guardar el acuerdo.",
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const agreement: Agreement = await request("/api/mentors/acuerdos", {
        method: "POST",
        body: JSON.stringify({
          // Utilizar el mismo identificador que GET.
          bookingId: normalizedBookingId,
          titulo: title,
          descripcion: description,
          observacion: observation,
          fecha_limite: dueDate,
          enlaces: resourceLinks,
        }),
      });

      setAgreements((current) => [
        ...current,
        {
          ...agreement,
          enlaces: agreement.enlaces ?? [],
        },
      ]);

      setTitle("");
      setDescription("");
      setObservation("");
      setDueDate("");
      setResourceUrl("");
      setResourceLinks([]);
      setResourceError("");
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

  /* =========================================================
     ACTUALIZAR ESTADO
     ========================================================= */

  async function updateStatus(id: string, estado: AgreementStatus) {
    try {
      setError("");

      const agreement: Agreement = await request("/api/mentors/acuerdos", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          estado,
        }),
      });

      setAgreements((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...agreement,
                enlaces: agreement.enlaces ?? [],
              }
            : item,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el acuerdo.",
      );
    }
  }

  /* =========================================================
     ELIMINAR ACUERDO
     ========================================================= */

  async function deleteAgreement(id: string) {
    if (!window.confirm("¿Eliminar este acuerdo?")) {
      return;
    }

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

  /* =========================================================
     INTERFAZ
     ========================================================= */

  return (
    <main className="page-content">
      <section className={`welcome-row ${styles.heading}`}>
        <div>
          <p className={styles.sectionLabel}>REGISTRO DE MENTORÍA</p>

          <h1>Registrar acuerdos con mis mentees</h1>

          <p className="intro">
            Registra los compromisos acordados durante esta sesión y realiza su
            seguimiento.
          </p>
        </div>
      </section>

      <Link className={styles.backLink} href="/mentorias">
        ← Volver a mentorías
      </Link>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {/* ===================================================
          FORMULARIO
          =================================================== */}

      <section className={styles.formCard}>
        <div className={styles.formHeader}>
          <h2>Registrar acuerdo</h2>

          <p>
            Completa la información del compromiso establecido durante la
            mentoría.
          </p>
        </div>

        <form onSubmit={createAgreement} className={styles.form}>
          <label className={`${styles.field} ${styles.wideField}`}>
            <span>Título del acuerdo</span>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej.: Leer el libro recomendado"
              required
            />
          </label>

          <label className={`${styles.field} ${styles.wideField}`}>
            <span>Descripción</span>

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripción del compromiso"
              rows={3}
            />
          </label>

          <label className={styles.field}>
            <span>Evidencia</span>

            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Describe la evidencia esperada para verificar el cumplimiento del acuerdo"
              rows={2}
            />
          </label>

          <label className={styles.field}>
            <span>Fecha límite</span>

            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>

          {/* =================================================
              RECURSOS DE REFERENCIA
              ================================================= */}

          <div className={`${styles.wideField} ${styles.resourceSection}`}>
            <div className={styles.resourceHeading}>
              <label htmlFor="resource-url">Recursos de referencia</label>

              <p>
                Comparte videos, libros o material de consulta para el mentee, Compartir archivos subidos a Drive.
              </p>
            </div>

            <div className={styles.resourceEntry}>
              <input
                id="resource-url"
                type="url"
                value={resourceUrl}
                onChange={(event) => {
                  setResourceUrl(event.target.value);
                  setResourceError("");
                }}
                placeholder="https://..."
                maxLength={2048}
                disabled={saving}
              />

              <button
                type="button"
                className={styles.addResourceButton}
                onClick={addResource}
                disabled={saving || resourceLinks.length >= MAX_LINKS}
              >
                Agregar enlace
              </button>
            </div>

            {resourceError && (
              <p className={styles.resourceError} role="alert">
                {resourceError}
              </p>
            )}

            {resourceLinks.length > 0 && (
              <div className={styles.resourceList}>
                {resourceLinks.map((url) => (
                  <AgreementResourcePreview
                    key={url}
                    url={url}
                    onRemove={() => removeResource(url)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.formActions}>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Agregar acuerdo"}
            </button>
          </div>
        </form>
      </section>

      {/* ===================================================
          LISTADO DE ACUERDOS
          =================================================== */}

      {loading ? (
        <div className={styles.emptyState}>
          <h2>Cargando acuerdos...</h2>
        </div>
      ) : loadError ? (
        <div className={styles.emptyState}>
          <h2>No se pudieron cargar los acuerdos</h2>

          <p>{loadError}</p>

          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void loadAgreements()}
            style={{ marginTop: "16px" }}
          >
            Reintentar
          </button>
        </div>
      ) : agreements.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Aún no hay acuerdos registrados</h2>

          <p>Registra los compromisos definidos en esta mentoría.</p>
        </div>
      ) : (
        <section className={styles.agreementList}>
          <div className={styles.listHeader}>
            <h2>Acuerdos registrados</h2>

            <span className={styles.agreementCount}>
              {agreements.length}{" "}
              {agreements.length === 1 ? "acuerdo" : "acuerdos"}
            </span>
          </div>

          {agreements.map((agreement) => (
            <article className={styles.agreementCard} key={agreement.id}>
              <div className={styles.agreementInfo}>
                <p
                  className={`${styles.agreementStatus} ${
                    agreement.estado === "pendiente"
                      ? styles.status_pendiente
                      : agreement.estado === "en_progreso"
                        ? styles.status_en_progreso
                        : agreement.estado === "cumplido"
                          ? styles.status_cumplido
                          : styles.status_cancelado
                  }`}
                >
                  {statusLabels[agreement.estado]}
                </p>

                <h3>{agreement.titulo}</h3>

                {agreement.descripcion && (
                  <p className={styles.agreementDescription}>
                    {agreement.descripcion}
                  </p>
                )}

                {agreement.observacion && (
                  <p className={styles.agreementMeta}>
                    <strong>Evidencia:</strong> {agreement.observacion}
                  </p>
                )}

                {agreement.fecha_limite && (
                  <p className={styles.agreementMeta}>
                    <strong>Fecha límite:</strong>{" "}
                    {new Date(
                      `${agreement.fecha_limite}T00:00:00`,
                    ).toLocaleDateString("es-PE")}
                  </p>
                )}

                {agreement.enlaces?.length > 0 && (
                  <div className={styles.savedResources}>
                    <h4>Recursos de referencia</h4>

                    <div className={styles.resourceList}>
                      {agreement.enlaces.map((url) => (
                        <AgreementResourcePreview key={url} url={url} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.agreementActions}>
                <label className={styles.statusControl}>
                  <span>Estado</span>

                  <select
                    value={agreement.estado}
                    onChange={(event) =>
                      updateStatus(
                        agreement.id,
                        event.target.value as AgreementStatus,
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
