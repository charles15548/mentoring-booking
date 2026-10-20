
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import styles from "./mentee-agreements.module.css";

type AgreementStatus =
  | "pendiente"
  | "en_progreso"
  | "cumplido"
  | "cancelado";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: AgreementStatus;
  fecha_limite: string | null;
  enlaces?: string[] | null;
};

type Evidence = {
  id: string;
  acuerdo_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  created_at: string;
};

type Direction = "next" | "previous";

type DeleteTarget = {
  agreementId: string;
  evidence: Evidence;
};

const statusLabels: Record<AgreementStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha límite";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSize(bytes: number | null) {
  if (bytes === null || bytes < 0) return "";

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEvidenceDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sortEvidence(evidence: Evidence[]) {
  return [...evidence].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

function getResource(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const isYouTube =
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtu.be";

    let videoId: string | null = null;

    if (isYouTube) {
      if (hostname === "youtu.be") {
        videoId = url.pathname.split("/")[1] || null;
      } else if (
        url.pathname.startsWith("/shorts/") ||
        url.pathname.startsWith("/embed/")
      ) {
        videoId = url.pathname.split("/")[2] || null;
      } else {
        videoId = url.searchParams.get("v");
      }
    }

    if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      videoId = null;
    }

    return {
      href: url.href,
      hostname,
      isYouTube,
      thumbnail: videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : null,
    };
  } catch {
    return null;
  }
}

export default function MenteeAgreements({
  bookingId,
}: {
  bookingId: string;
}) {
  const [items, setItems] = useState<Agreement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] =
    useState<Direction>("next");

  const [evidencias, setEvidencias] = useState<
    Record<string, Evidence[]>
  >({});

  const [selectedFiles, setSelectedFiles] = useState<
    Record<string, File | null>
  >({});

  const [uploading, setUploading] = useState<
    Record<string, boolean>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // Distingue mensajes dentro del modal y fuera de él.
  const [successInModal, setSuccessInModal] = useState(false);

  const [modalAgreementId, setModalAgreementId] =
    useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<DeleteTarget | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fileInputs = useRef<
    Record<string, HTMLInputElement | null>
  >({});

  const modalRef = useRef<HTMLDivElement | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(
    null,
  );
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const deletingRef = useRef(false);
  const deleteTargetRef = useRef<DeleteTarget | null>(null);

  // Oculta automáticamente las confirmaciones.
  useEffect(() => {
    if (!successMessage) return;

    const timer = window.setTimeout(() => {
      setSuccessMessage("");
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [successMessage]);

  // Accesibilidad del historial de evidencias.
  useEffect(() => {
    if (!modalAgreementId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    modalCloseRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (deleteTargetRef.current) return;

      if (event.key === "Escape") {
        setModalAgreementId(null);
        setSuccessInModal(false);
        setSuccessMessage("");
        return;
      }

      if (event.key !== "Tab") return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => element.getClientRects().length > 0,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      if (
        !deleteTargetRef.current &&
        previousFocusRef.current?.isConnected
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [modalAgreementId]);

  // Accesibilidad de la confirmación de eliminación.
  useEffect(() => {
    if (!deleteTarget) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    cancelDeleteRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        if (!deletingRef.current) {
          closeDeleteDialog();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = deleteDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener(
        "keydown",
        handleKeyDown,
        true,
      );

      if (deleteTriggerRef.current?.isConnected) {
        deleteTriggerRef.current.focus();
      } else if (modalAgreementId) {
        modalCloseRef.current?.focus();
      }
    };
  }, [deleteTarget, modalAgreementId]);

  async function call<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No se encontró la sesión activa.");
    }

    const isFormData = init?.body instanceof FormData;

    const response = await fetch(path, {
      ...init,
      headers: {
        ...(isFormData
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error || "No se pudo completar la operación.",
      );
    }

    return data as T;
  }

  async function loadEvidence(agreementId: string) {
    try {
      const data = await call<Evidence[]>(
        `/api/mentee/evidencias?acuerdoId=${encodeURIComponent(
          agreementId,
        )}`,
      );

      setEvidencias((current) => ({
        ...current,
        [agreementId]: Array.isArray(data) ? data : [],
      }));
    } catch (loadError) {
      console.error("Error cargando evidencias:", loadError);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadAgreements() {
      try {
        setLoading(true);
        setError("");
        setSuccessMessage("");
        setSuccessInModal(false);
        setActiveIndex(0);
        setModalAgreementId(null);
        setEvidencias({});
        setSelectedFiles({});

        const agreements = await call<Agreement[]>(
          `/api/mentee/acuerdos?bookingId=${encodeURIComponent(
            bookingId,
          )}`,
        );

        if (!active) return;

        const list = Array.isArray(agreements)
          ? agreements
          : [];

        setItems(list);

        await Promise.all(
          list.map(async (agreement) => {
            try {
              const data = await call<Evidence[]>(
                `/api/mentee/evidencias?acuerdoId=${encodeURIComponent(
                  agreement.id,
                )}`,
              );

              if (!active) return;

              setEvidencias((current) => ({
                ...current,
                [agreement.id]: Array.isArray(data)
                  ? data
                  : [],
              }));
            } catch (loadError) {
              console.error(
                "Error cargando evidencias:",
                loadError,
              );
            }
          }),
        );
      } catch (loadError) {
        if (!active) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los acuerdos.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAgreements();

    return () => {
      active = false;
    };
  }, [bookingId]);

  function moveAgreement(nextIndex: number) {
    if (
      nextIndex < 0 ||
      nextIndex >= items.length ||
      nextIndex === activeIndex
    ) {
      return;
    }

    setModalAgreementId(null);
    setSuccessMessage("");
    setSuccessInModal(false);
    setDirection(
      nextIndex > activeIndex ? "next" : "previous",
    );
    setActiveIndex(nextIndex);
    setError("");
  }

  function selectFile(
    agreementId: string,
    file: File | null,
  ) {
    setSelectedFiles((current) => ({
      ...current,
      [agreementId]: file,
    }));
  }

  function resetFileInput(agreementId: string) {
    setSelectedFiles((current) => ({
      ...current,
      [agreementId]: null,
    }));

    const input = fileInputs.current[agreementId];
    if (input) input.value = "";
  }

  function clearSelectedFile(agreementId: string) {
    if (uploading[agreementId]) return;
    resetFileInput(agreementId);
  }

  async function uploadEvidence(agreementId: string) {
    const file = selectedFiles[agreementId];

    if (!file) {
      setError("Selecciona un archivo antes de subirlo.");
      return;
    }

    if (uploading[agreementId]) return;

    try {
      setError("");
      setSuccessMessage("");
      setSuccessInModal(false);

      setUploading((current) => ({
        ...current,
        [agreementId]: true,
      }));

      const formData = new FormData();
      formData.append("acuerdoId", agreementId);
      formData.append("file", file);

      await call("/api/mentee/evidencias", {
        method: "POST",
        body: formData,
      });

      resetFileInput(agreementId);
      await loadEvidence(agreementId);

      setSuccessMessage("Evidencia subida correctamente.");
    } catch (uploadError) {
      setSuccessMessage("");

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No se pudo subir la evidencia.",
      );
    } finally {
      setUploading((current) => ({
        ...current,
        [agreementId]: false,
      }));
    }
  }

  function getEvidenceUrl(path: string) {
    return supabase.storage
      .from("bucket")
      .getPublicUrl(path).data.publicUrl;
  }

  function openEvidenceModal(
    agreementId: string,
    trigger: HTMLElement,
  ) {
    previousFocusRef.current = trigger;
    setSuccessMessage("");
    setSuccessInModal(false);
    setModalAgreementId(agreementId);
  }

  function closeEvidenceModal() {
    if (deleteTargetRef.current) return;

    setModalAgreementId(null);
    setSuccessInModal(false);
    setSuccessMessage("");
  }

  /* =====================================================
     ELIMINACIÓN DE EVIDENCIAS
  ===================================================== */

  function openDeleteDialog(
    agreementId: string,
    evidence: Evidence,
    trigger: HTMLElement,
  ) {
    deleteTriggerRef.current = trigger;
    setDeleteError("");
    setSuccessMessage("");

    // Se conserva el origen antes de abrir la confirmación.
    setSuccessInModal(modalAgreementId === agreementId);

    const target: DeleteTarget = {
      agreementId,
      evidence,
    };

    deleteTargetRef.current = target;
    setDeleteTarget(target);
  }

  function closeDeleteDialog() {
    if (deletingRef.current) return;

    deleteTargetRef.current = null;
    setDeleteTarget(null);
    setDeleteError("");
  }

  async function confirmDeleteEvidence() {
    if (!deleteTarget || deletingRef.current) return;

    const { agreementId, evidence } = deleteTarget;

    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    setError("");

    try {
      await call<{
        success: boolean;
        message: string;
        evidenciaId: string;
      }>("/api/mentee/evidencias", {
        method: "DELETE",
        body: JSON.stringify({
          acuerdoId: agreementId,
          evidenciaId: evidence.id,
        }),
      });

      // Retirar el documento eliminado sin recargar la página.
      setEvidencias((current) => ({
        ...current,
        [agreementId]: (
          current[agreementId] ?? []
        ).filter((item) => item.id !== evidence.id),
      }));

      deleteTargetRef.current = null;
      setDeleteTarget(null);
      setDeleteError("");

      // El mensaje irá dentro del historial cuando
      // la eliminación se inició en ese modal.
      setSuccessMessage("Evidencia eliminada correctamente.");

      await loadEvidence(agreementId);
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "No se pudo eliminar la evidencia.",
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const modalAgreement = items.find(
    (agreement) => agreement.id === modalAgreementId,
  );

  const modalEvidence = modalAgreementId
    ? sortEvidence(evidencias[modalAgreementId] ?? [])
    : [];

  return (
    <main className={`page-content ${styles.menteePage}`}>
      {/* ENCABEZADO */}

      <section className={styles.header}>
        <h1 className={styles.heading}>Revisar acuerdos con mi mentor</h1>

        <p className={styles.description}>
          Revisa los compromisos con tu mentor, sube las evidencias de tu avance.
        </p>
      </section>

      <Link
        href="/mentoriasMentee"
        className={styles.backLink}
      >
        <ArrowLeft size={15} />
        Volver a Repositorio de Mentorías
      </Link>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="empty-state">
          <h2>Cargando acuerdos...</h2>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>No hay acuerdos registrados</h2>
          <p>
            Tu mentor aún no ha registrado acuerdos
            para esta sesión.
          </p>
        </div>
      ) : (
        <section
          className={styles.carousel}
          aria-label="Acuerdos de mentoría"
        >
          <button
            type="button"
            className={`${styles.navButton} ${styles.navLeft}`}
            onClick={() => moveAgreement(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Acuerdo anterior"
            title="Acuerdo anterior"
          >
            <ChevronLeft size={22} />
          </button>

          <div className={styles.viewport}>
            <div className={styles.slidesGrid}>
              {items.map((agreement, index) => {
                const isActive = index === activeIndex;

                const agreementEvidence = sortEvidence(
                  evidencias[agreement.id] ?? [],
                );

                const latestEvidence =
                  agreementEvidence[0] ?? null;

                const selectedFile =
                  selectedFiles[agreement.id] ?? null;

                const isUploading =
                  uploading[agreement.id] ?? false;

                const resources = (
                  Array.isArray(agreement.enlaces)
                    ? agreement.enlaces
                    : []
                )
                  .map(getResource)
                  .filter(
                    (
                      resource,
                    ): resource is NonNullable<
                      ReturnType<typeof getResource>
                    > => resource !== null,
                  );

                return (
                  <article
                    key={agreement.id}
                    aria-hidden={!isActive}
                    className={[
                      styles.agreementCard,
                      styles.agreementSlide,
                      isActive
                        ? styles.agreementSlideActive
                        : "",
                      isActive
                        ? direction === "next"
                          ? styles.slideFromRight
                          : styles.slideFromLeft
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className={styles.agreementInfo}>
                      <p className={styles.agreementNumber}>
                        ACUERDO {index + 1}
                      </p>

                      <div className={styles.agreementHeadingRow}>
                        <h2 className={styles.agreementTitle}>
                          {agreement.titulo}
                        </h2>

                        <span
                          className={`${styles.statusBadge} ${
                            agreement.estado === "cumplido"
                              ? styles.statusDone
                              : agreement.estado === "en_progreso"
                                ? styles.statusProgress
                                : agreement.estado === "cancelado"
                                  ? styles.statusCancelled
                                  : styles.statusPending
                          }`}
                        >
                          {agreement.estado === "cumplido" && (
                            <CheckCircle2 size={13} />
                          )}

                          {statusLabels[agreement.estado] ??
                            agreement.estado}
                        </span>
                      </div>

                      {agreement.descripcion && (
                        <p className={styles.agreementDescription}>
                          {agreement.descripcion}
                        </p>
                      )}

                      {agreement.observacion && (
                        <div className={styles.observation}>
                          <span className={styles.fieldLabel}>
                            Acuerdo del mentor
                          </span>
                          <p>{agreement.observacion}</p>
                        </div>
                      )}

                      {agreement.fecha_limite && (
                        <div className={styles.deadline}>
                          <CalendarDays size={15} />
                          <span>
                            Fecha límite:{" "}
                            <strong>
                              {formatDate(agreement.fecha_limite)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className={styles.contentGrid}>
                      {/* RECURSOS DEL MENTOR */}

                      <section className={styles.resourcesPanel}>
                        <div className={styles.sectionHeading}>
                          <div className={styles.sectionHeadingTitle}>
                            <Link2 size={17} />
                            <h3>Recursos del mentor</h3>
                          </div>

                          <p>
                            Material de referencia compartido
                            por tu mentor.
                          </p>
                        </div>

                        {resources.length === 0 ? (
                          <div className={styles.emptyResources}>
                            Este acuerdo no tiene recursos compartidos.
                          </div>
                        ) : (
                          <div className={styles.resourceList}>
                            {resources.map((resource, resourceIndex) => (
                              <a
                                key={`${resource.href}-${resourceIndex}`}
                                className={styles.resourceCard}
                                href={resource.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                tabIndex={isActive ? 0 : -1}
                              >
                                {resource.thumbnail ? (
                                  <img
                                    className={styles.resourceThumbnail}
                                    src={resource.thumbnail}
                                    alt="Vista previa del video"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className={styles.resourceIcon}>
                                    <Link2 size={20} />
                                  </div>
                                )}

                                <div className={styles.resourceText}>
                                  <strong>
                                    {resource.isYouTube
                                      ? "Video de YouTube"
                                      : "Enlace de referencia"}
                                  </strong>

                                  <span>{resource.hostname}</span>
                                </div>

                                <ExternalLink size={15} />
                              </a>
                            ))}
                          </div>
                        )}
                      </section>

                      {/* EVIDENCIAS DEL MENTEE */}

                      <section className={styles.evidencePanel}>
                        <div className={styles.sectionHeading}>
                          <div className={styles.sectionHeadingTitle}>
                            <Paperclip size={17} />
                            <h3>Evidencia de avance</h3>
                          </div>

                          <p>
                            Adjunta un archivo que demuestre
                            el avance de este acuerdo.
                          </p>
                        </div>

                        {latestEvidence ? (
                          <div className={styles.evidenceList}>
                            <p className={styles.evidenceListTitle}>
                              Evidencias enviadas
                            </p>

                            <div className={styles.evidenceItemWithDelete}>
                              <a
                                className={styles.evidenceItem}
                                href={getEvidenceUrl(
                                  latestEvidence.ruta_archivo,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={latestEvidence.nombre_archivo}
                                tabIndex={isActive ? 0 : -1}
                              >
                                <FileText size={19} />

                                <div className={styles.evidenceText}>
                                  <strong>
                                    {latestEvidence.nombre_archivo}
                                  </strong>

                                  {latestEvidence.tamano !== null && (
                                    <small>
                                      {formatSize(
                                        latestEvidence.tamano,
                                      )}
                                    </small>
                                  )}
                                </div>

                                <ExternalLink size={15} />
                              </a>

                              <button
                                type="button"
                                className={styles.deleteEvidenceButton}
                                disabled={!isActive}
                                tabIndex={isActive ? 0 : -1}
                                title="Eliminar evidencia enviada"
                                aria-label={`Eliminar evidencia ${latestEvidence.nombre_archivo}`}
                                onClick={(event) =>
                                  openDeleteDialog(
                                    agreement.id,
                                    latestEvidence,
                                    event.currentTarget,
                                  )
                                }
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>

                            {agreementEvidence.length > 1 && (
                              <button
                                type="button"
                                className={styles.viewAllEvidence}
                                disabled={!isActive}
                                onClick={(event) =>
                                  openEvidenceModal(
                                    agreement.id,
                                    event.currentTarget,
                                  )
                                }
                              >
                                <FolderOpen size={16} />
                                Ver todas las evidencias (
                                {agreementEvidence.length})
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className={styles.emptyEvidence}>
                            Aún no hay evidencias enviadas.
                          </div>
                        )}

                        {/* ADJUNTAR NUEVA EVIDENCIA */}

                        <div className={styles.uploadArea}>
                          <span className={styles.inputLabel}>
                            Adjuntar nueva evidencia
                          </span>

                          <div className={styles.uploadActions}>
                            <input
                              id={`evidence-${agreement.id}`}
                              ref={(element) => {
                                fileInputs.current[agreement.id] =
                                  element;
                              }}
                              className={styles.hiddenFileInput}
                              type="file"
                              disabled={!isActive || isUploading}
                              tabIndex={isActive ? 0 : -1}
                              onChange={(event) =>
                                selectFile(
                                  agreement.id,
                                  event.target.files?.[0] ?? null,
                                )
                              }
                            />

                            <label
                              htmlFor={`evidence-${agreement.id}`}
                              className={styles.selectFileButton}
                              aria-disabled={!isActive || isUploading}
                            >
                              <Paperclip size={16} />
                              Seleccionar archivo
                            </label>

                            <button
                              className={styles.uploadButton}
                              type="button"
                              disabled={
                                !isActive ||
                                !selectedFile ||
                                isUploading
                              }
                              onClick={() =>
                                void uploadEvidence(agreement.id)
                              }
                            >
                              <Upload size={16} />
                              {isUploading
                                ? "Subiendo..."
                                : "Subir evidencia"}
                            </button>
                          </div>

                          {selectedFile ? (
                            <div className={styles.selectedFileRow}>
                              <div className={styles.selectedFileInfo}>
                                <FileText size={17} />
                                <span title={selectedFile.name}>
                                  {selectedFile.name}
                                </span>
                              </div>

                              <button
                                type="button"
                                className={styles.clearFileButton}
                                onClick={() =>
                                  clearSelectedFile(agreement.id)
                                }
                                disabled={!isActive || isUploading}
                                tabIndex={isActive ? 0 : -1}
                                aria-label={`Quitar archivo ${selectedFile.name}`}
                                title="Quitar archivo seleccionado"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <p
                              className={styles.fileStatus}
                              aria-live={isActive ? "polite" : "off"}
                            >
                              Ningún archivo seleccionado
                            </p>
                          )}
                        </div>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* NAVEGACIÓN SIGUIENTE */}

          <button
            type="button"
            className={`${styles.navButton} ${styles.navRight}`}
            onClick={() => moveAgreement(activeIndex + 1)}
            disabled={activeIndex === items.length - 1}
            aria-label="Acuerdo siguiente"
            title="Acuerdo siguiente"
          >
            <ChevronRight size={22} />
          </button>

          <div className={styles.pagination}>
            <span>
              Acuerdo {activeIndex + 1} de {items.length}
            </span>

            <div className={styles.dots}>
              {items.map((agreement, index) => (
                <button
                  key={agreement.id}
                  type="button"
                  className={`${styles.dot} ${
                    index === activeIndex
                      ? styles.dotActive
                      : ""
                  }`}
                  onClick={() => moveAgreement(index)}
                  aria-label={`Ver acuerdo ${index + 1}`}
                  aria-current={
                    index === activeIndex
                      ? "step"
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MODAL: HISTORIAL DE EVIDENCIAS */}

      {modalAgreement && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !deleteTarget
            ) {
              closeEvidenceModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className={styles.evidenceModal}
            role="dialog"
            aria-modal={!deleteTarget}
            aria-labelledby="evidence-modal-title"
            aria-describedby="evidence-modal-description"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeading}>
                <span className={styles.modalEyebrow}>
                  HISTORIAL DE EVIDENCIAS
                </span>

                <h2 id="evidence-modal-title">
                  Evidencias enviadas
                </h2>

                <p id="evidence-modal-description">
                  {modalAgreement.titulo}
                </p>
              </div>

              <button
                ref={modalCloseRef}
                type="button"
                className={styles.modalClose}
                onClick={closeEvidenceModal}
                disabled={Boolean(deleteTarget)}
                aria-label="Cerrar historial de evidencias"
                title="Cerrar"
              >
                <X size={21} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Confirmación dentro del historial */}
              {successMessage && successInModal && (
                <div
                  className={styles.modalSuccessMessage}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <CheckCircle2 size={18} />
                  <span>{successMessage}</span>
                </div>
              )}

              <p className={styles.modalCount}>
                {modalEvidence.length}{" "}
                {modalEvidence.length === 1
                  ? "evidencia enviada"
                  : "evidencias enviadas"}
              </p>

              {modalEvidence.length === 0 ? (
                <div className={styles.emptyEvidence}>
                  Aún no hay evidencias enviadas.
                </div>
              ) : (
                <div className={styles.modalEvidenceList}>
                  {modalEvidence.map((evidence, index) => (
                    <div
                      key={evidence.id}
                      className={styles.modalEvidenceRow}
                    >
                      <a
                        href={getEvidenceUrl(evidence.ruta_archivo)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.modalEvidenceItem}
                        title={evidence.nombre_archivo}
                        tabIndex={deleteTarget ? -1 : 0}
                      >
                        <div className={styles.modalEvidenceIcon}>
                          <FileText size={21} />
                        </div>

                        <div className={styles.modalEvidenceInfo}>
                          <strong>{evidence.nombre_archivo}</strong>

                          <span>
                            {[
                              formatSize(evidence.tamano),
                              formatEvidenceDate(
                                evidence.created_at,
                              ),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>

                        {index === 0 && (
                          <span className={styles.latestEvidenceBadge}>
                            Reciente
                          </span>
                        )}

                        <ExternalLink size={17} />
                      </a>

                      <button
                        type="button"
                        className={styles.deleteEvidenceButton}
                        disabled={Boolean(deleteTarget)}
                        title="Eliminar evidencia"
                        aria-label={`Eliminar evidencia ${evidence.nombre_archivo}`}
                        onClick={(event) =>
                          openDeleteDialog(
                            evidence.acuerdo_id,
                            evidence,
                            event.currentTarget,
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalDone}
                onClick={closeEvidenceModal}
                disabled={Boolean(deleteTarget)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMACIÓN DE ELIMINACIÓN */}

      {deleteTarget && (
        <div
          className={styles.deleteOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteDialog();
            }
          }}
        >
          <div
            ref={deleteDialogRef}
            className={styles.deleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-evidence-title"
            aria-describedby="delete-evidence-description"
            tabIndex={-1}
          >
            <div className={styles.deleteDialogHeader}>
              <div className={styles.deleteDialogIcon}>
                <Trash2 size={22} />
              </div>

              <div>
                <h2 id="delete-evidence-title">
                  ¿Eliminar evidencia?
                </h2>

                <p id="delete-evidence-description">
                  El archivo enviado se eliminará
                  de forma permanente.
                </p>
              </div>
            </div>

            <div className={styles.deleteFilePreview}>
              <FileText size={18} />

              <span title={deleteTarget.evidence.nombre_archivo}>
                {deleteTarget.evidence.nombre_archivo}
              </span>
            </div>

            {deleteError && (
              <p className={styles.deleteError} role="alert">
                {deleteError}
              </p>
            )}

            <div className={styles.deleteDialogActions}>
              <button
                ref={cancelDeleteRef}
                type="button"
                className={styles.cancelDeleteButton}
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void confirmDeleteEvidence()}
                disabled={deleting}
              >
                <Trash2 size={16} />
                {deleting
                  ? "Eliminando..."
                  : "Eliminar evidencia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST EXTERIOR: SOLO ACCIONES FUERA DEL MODAL */}

      {successMessage && !successInModal && (
        <div
          className={styles.successToast}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <CheckCircle2
            size={20}
            className={styles.successToastIcon}
          />

          <span>{successMessage}</span>

          <button
            type="button"
            className={styles.dismissToast}
            onClick={() => setSuccessMessage("")}
            aria-label="Cerrar notificación"
            title="Cerrar"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </main>
  );
}
