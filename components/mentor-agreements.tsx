"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import AgreementResourcePreview from "./agreement-resource-preview";
import styles from "./mentor-agreements-detail.module.css";
import modalStyles from "./mentor-agreement-modal.module.css";

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

type AgreementForm = {
  titulo: string;
  descripcion: string;
  observacion: string;
  fecha_limite: string;
  enlaces: string[];
};

const statusLabels: Record<AgreementStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

const MAX_LINKS = 10;

function normalizeBookingId(value: string) {
  const trimmed = value.trim();

  if (!/%[0-9a-fA-F]{2}/.test(trimmed)) {
    return trimmed;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeLink(value: string): string | null {
  try {
    const trimmed = value.trim();

    if (trimmed.length > 2048) return null;

    const parsed = new URL(trimmed);

    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function agreementToForm(agreement: Agreement): AgreementForm {
  return {
    titulo: agreement.titulo,
    descripcion: agreement.descripcion ?? "",
    observacion: agreement.observacion ?? "",
    fecha_limite: agreement.fecha_limite ?? "",
    enlaces: [...(agreement.enlaces ?? [])],
  };
}

function emptyForm(): AgreementForm {
  return {
    titulo: "",
    descripcion: "",
    observacion: "",
    fecha_limite: "",
    enlaces: [],
  };
}

export default function MentorAgreements({ bookingId }: { bookingId: string }) {
  const normalizedBookingId = normalizeBookingId(bookingId);

  const [agreements, setAgreements] = useState<Agreement[]>([]);

  // Formulario de registro
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [observation, setObservation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceLinks, setResourceLinks] = useState<string[]>([]);
  const [resourceError, setResourceError] = useState("");

  // Modal de edición
  const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(
    null,
  );

  const [editForm, setEditForm] = useState<AgreementForm>(emptyForm);

  const [editResourceUrl, setEditResourceUrl] = useState("");
  const [editResourceError, setEditResourceError] = useState("");
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);

  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void loadAgreements();
  }, [normalizedBookingId]);

  useEffect(() => {
    if (!editingAgreement) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;

    document.body.style.overflow = "hidden";
    editTitleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [editingAgreement?.id]);

  const hasEditChanges =
    editingAgreement !== null &&
    JSON.stringify(editForm) !==
      JSON.stringify(agreementToForm(editingAgreement));

  function closeModal() {
    if (editSaving) return;

    if (
      hasEditChanges &&
      !window.confirm(
        "Tienes cambios sin guardar. ¿Deseas salir de la edición?",
      )
    ) {
      return;
    }

    setEditingAgreement(null);
    setEditForm(emptyForm());
    setEditResourceUrl("");
    setEditResourceError("");
    setEditingLinkIndex(null);
    setEditError("");
  }

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
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo completar la operación.");
    }

    return data;
  }

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
     CREACIÓN: RECURSOS DE REFERENCIA
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
      setSuccess("");

      const agreement: Agreement = await request("/api/mentors/acuerdos", {
        method: "POST",
        body: JSON.stringify({
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
      setSuccess("Acuerdo registrado correctamente.");
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
     MODAL: APERTURA Y EDICIÓN
  ========================================================= */

  function openEditModal(agreement: Agreement) {
    setEditingAgreement(agreement);
    setEditForm(agreementToForm(agreement));
    setEditResourceUrl("");
    setEditResourceError("");
    setEditingLinkIndex(null);
    setEditError("");
    setError("");
    setSuccess("");
  }

  function setEditField(
    field: "titulo" | "descripcion" | "observacion" | "fecha_limite",
    value: string,
  ) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEditingLink(index: number) {
    setEditingLinkIndex(index);
    setEditResourceUrl(editForm.enlaces[index]);
    setEditResourceError("");
  }

  function cancelEditingLink() {
    setEditingLinkIndex(null);
    setEditResourceUrl("");
    setEditResourceError("");
  }

  function addOrUpdateEditLink() {
    const normalized = normalizeLink(editResourceUrl);
    setEditResourceError("");

    if (!normalized) {
      setEditResourceError(
        "Ingresa un enlace válido que comience con https:// o http://.",
      );
      return;
    }

    const duplicated = editForm.enlaces.some(
      (link, index) => link === normalized && index !== editingLinkIndex,
    );

    if (duplicated) {
      setEditResourceError("Este enlace ya fue agregado.");
      return;
    }

    if (editingLinkIndex === null && editForm.enlaces.length >= MAX_LINKS) {
      setEditResourceError("Puedes agregar hasta 10 enlaces por acuerdo.");
      return;
    }

    setEditForm((current) => {
      const links = [...current.enlaces];

      if (editingLinkIndex === null) {
        links.push(normalized);
      } else {
        links[editingLinkIndex] = normalized;
      }

      return {
        ...current,
        enlaces: links,
      };
    });

    cancelEditingLink();
  }

  function removeEditLink(index: number) {
    setEditForm((current) => ({
      ...current,
      enlaces: current.enlaces.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    }));

    cancelEditingLink();
  }

  async function saveEditedAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingAgreement || editSaving) return;

    if (!editForm.titulo.trim()) {
      setEditError("El título del acuerdo es obligatorio.");
      return;
    }

    if (editResourceUrl.trim()) {
      setEditResourceError(
        "Tienes un enlace sin guardar. Agrégalo o cancela su edición.",
      );
      return;
    }

    try {
      setEditSaving(true);
      setEditError("");

      const agreement: Agreement = await request("/api/mentors/acuerdos", {
        method: "PATCH",
        body: JSON.stringify({
          id: editingAgreement.id,
          titulo: editForm.titulo.trim(),
          descripcion: editForm.descripcion,
          observacion: editForm.observacion,
          fecha_limite: editForm.fecha_limite,
          enlaces: editForm.enlaces,
        }),
      });

      setAgreements((current) =>
        current.map((item) =>
          item.id === agreement.id
            ? {
                ...agreement,
                enlaces: agreement.enlaces ?? [],
              }
            : item,
        ),
      );

      setEditingAgreement(null);
      setEditForm(emptyForm());
      setEditResourceUrl("");
      setEditingLinkIndex(null);
      setSuccess("Acuerdo actualizado correctamente.");
    } catch (saveError) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar el acuerdo.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  /* =========================================================
     ESTADO Y ELIMINACIÓN
  ========================================================= */

  async function updateStatus(id: string, estado: AgreementStatus) {
    if (updatingStatusId) return;

    try {
      setUpdatingStatusId(id);
      setError("");
      setSuccess("");

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

      setSuccess("Estado actualizado correctamente.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el acuerdo.",
      );
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function deleteAgreement(id: string) {
    if (deletingId) return;

    if (!window.confirm("¿Eliminar este acuerdo?")) {
      return;
    }

    try {
      setDeletingId(id);
      setError("");
      setSuccess("");

      await request(`/api/mentors/acuerdos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      setAgreements((current) => current.filter((item) => item.id !== id));

      setSuccess("Acuerdo eliminado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el acuerdo.",
      );
    } finally {
      setDeletingId(null);
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

      {success && (
        <p className={modalStyles.successMessage} role="status">
          {success}
        </p>
      )}

      {/* FORMULARIO ORIGINAL DE REGISTRO */}

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
              disabled={saving}
            />
          </label>

          <label className={`${styles.field} ${styles.wideField}`}>
            <span>Descripción</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripción del compromiso"
              rows={3}
              disabled={saving}
            />
          </label>

          <label className={styles.field}>
            <span>Evidencia</span>
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Describe la evidencia esperada para verificar el cumplimiento del acuerdo"
              rows={2}
              disabled={saving}
            />
          </label>

          <label className={styles.field}>
            <span>Fecha límite</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={saving}
            />
          </label>

          <div className={`${styles.wideField} ${styles.resourceSection}`}>
            <div className={styles.resourceHeading}>
              <label htmlFor="resource-url">Recursos de referencia</label>
              <p>
                Comparte videos, libros o material de consulta para el mentee.
                Puedes compartir archivos subidos a Drive.
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

      {/* LISTADO */}

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
            style={{ marginTop: 16 }}
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
                    disabled={
                      updatingStatusId === agreement.id ||
                      deletingId === agreement.id
                    }
                    onChange={(event) =>
                      void updateStatus(
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
                  className={modalStyles.editButton}
                  type="button"
                  onClick={() => openEditModal(agreement)}
                  disabled={
                    updatingStatusId === agreement.id ||
                    deletingId === agreement.id
                  }
                >
                  Editar
                </button>

                <button
                  className={styles.deleteButton}
                  type="button"
                  disabled={
                    deletingId === agreement.id ||
                    updatingStatusId === agreement.id
                  }
                  onClick={() => void deleteAgreement(agreement.id)}
                >
                  {deletingId === agreement.id ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* MODAL DE EDICIÓN */}

      {editingAgreement && (
        <div
          className={modalStyles.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editSaving) {
              closeModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className={modalStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-agreement-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeModal();
              }

              if (event.key === "Tab") {
                const focusable =
                  modalRef.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
                  );

                if (!focusable?.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className={modalStyles.modalHeader}>
              <div>
                <h2 id="edit-agreement-title">Editar acuerdo</h2>
                <p>Actualiza la información y los recursos del acuerdo.</p>
              </div>

              <button
                type="button"
                className={modalStyles.closeButton}
                onClick={closeModal}
                disabled={editSaving}
                aria-label="Cerrar ventana"
              >
                ×
              </button>
            </div>

            <form onSubmit={(event) => void saveEditedAgreement(event)}>
              <div className={modalStyles.modalBody}>
                {editError && (
                  <p className="form-error" role="alert">
                    {editError}
                  </p>
                )}

                <div className={styles.form}>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Título del acuerdo</span>
                    <input
                      ref={editTitleRef}
                      type="text"
                      required
                      value={editForm.titulo}
                      onChange={(event) =>
                        setEditField("titulo", event.target.value)
                      }
                      disabled={editSaving}
                    />
                  </label>

                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Descripción</span>
                    <textarea
                      rows={3}
                      value={editForm.descripcion}
                      onChange={(event) =>
                        setEditField("descripcion", event.target.value)
                      }
                      disabled={editSaving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Evidencia</span>
                    <textarea
                      rows={3}
                      value={editForm.observacion}
                      onChange={(event) =>
                        setEditField("observacion", event.target.value)
                      }
                      disabled={editSaving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Fecha límite</span>
                    <input
                      type="date"
                      value={editForm.fecha_limite}
                      onChange={(event) =>
                        setEditField("fecha_limite", event.target.value)
                      }
                      disabled={editSaving}
                    />
                  </label>

                  <div
                    className={`${styles.wideField} ${styles.resourceSection}`}
                  >
                    <div className={styles.resourceHeading}>
                      <label htmlFor="edit-resource-url">
                        Recursos de referencia
                      </label>
                      <p>
                        Puedes agregar, modificar o eliminar los enlaces
                        guardados.
                      </p>
                    </div>

                    {editForm.enlaces.length > 0 && (
                      <div className={modalStyles.editLinkList}>
                        {editForm.enlaces.map((url, index) => (
                          <div
                            className={modalStyles.editLinkRow}
                            key={`${index}-${url}`}
                          >
                            <span title={url}>{url}</span>

                            <button
                              type="button"
                              onClick={() => startEditingLink(index)}
                              disabled={editSaving}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              className={modalStyles.removeLinkButton}
                              onClick={() => removeEditLink(index)}
                              disabled={editSaving}
                            >
                              Eliminar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={styles.resourceEntry}>
                      <input
                        id="edit-resource-url"
                        type="url"
                        value={editResourceUrl}
                        placeholder="https://..."
                        maxLength={2048}
                        disabled={editSaving}
                        onChange={(event) => {
                          setEditResourceUrl(event.target.value);
                          setEditResourceError("");
                        }}
                      />

                      <button
                        className={styles.addResourceButton}
                        type="button"
                        onClick={addOrUpdateEditLink}
                        disabled={editSaving}
                      >
                        {editingLinkIndex === null
                          ? "Agregar enlace"
                          : "Actualizar enlace"}
                      </button>
                    </div>

                    {editingLinkIndex !== null && (
                      <button
                        type="button"
                        className={modalStyles.textButton}
                        onClick={cancelEditingLink}
                        disabled={editSaving}
                      >
                        Cancelar edición del enlace
                      </button>
                    )}

                    {editResourceError && (
                      <p className={styles.resourceError} role="alert">
                        {editResourceError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className={modalStyles.modalFooter}>
                <button
                  type="button"
                  className={modalStyles.cancelButton}
                  onClick={closeModal}
                  disabled={editSaving}
                >
                  Cancelar
                </button>

                <button
                  className={styles.submitButton}
                  type="submit"
                  disabled={editSaving}
                >
                  {editSaving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
