"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Paperclip,
  UserRound,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import styles from "./mentor-evidence-detail.module.css";

/* =====================================================
   TIPOS
===================================================== */

type AgreementStatus = "pendiente" | "en_progreso" | "cumplido" | "cancelado";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: AgreementStatus;
  fecha_limite: string | null;
};

type Evidence = {
  id: string;
  acuerdo_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  created_at: string;
  url?: string;
};

type AgreementEvidence = {
  agreement: Agreement;
  evidencias: Evidence[];
};

type DetailResponse = {
  mentee: {
    nombre: string;
    email: string;
    fotoUrl: string | null;
    participantes: number;
  };
  totalEvidencias: number;
  totalAcuerdos: number;
  items: AgreementEvidence[];
};

const statusLabels: Record<AgreementStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

/* =====================================================
   FUNCIONES AUXILIARES
===================================================== */

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

function formatDeadline(value: string | null) {
  if (!value) return "";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSize(value: number | null) {
  if (value === null || value < 0) {
    return "";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sortEvidence(items: Evidence[]) {
  return [...items].sort(
    (first, second) =>
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime(),
  );
}

function statusClass(status: AgreementStatus) {
  switch (status) {
    case "cumplido":
      return styles.statusDone;

    case "en_progreso":
      return styles.statusProgress;

    case "cancelado":
      return styles.statusCancelled;

    default:
      return styles.statusPending;
  }
}

/* =====================================================
   FOTO DEL MENTEE

   Si existe una imagen, la muestra.
   Si no existe o falla, utiliza UserRound.
===================================================== */

function MenteeAvatar({
  nombre,
  fotoUrl,
}: {
  nombre: string;
  fotoUrl: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showImage = Boolean(fotoUrl) && failedUrl !== fotoUrl;

  return (
    <div className={styles.studentAvatar}>
      {showImage && fotoUrl ? (
        <img
          src={fotoUrl}
          alt={`Foto de ${nombre}`}
          className={styles.studentAvatarImage}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(fotoUrl)}
        />
      ) : (
        <UserRound size={23} aria-hidden="true" />
      )}
    </div>
  );
}

/* =====================================================
   COMPONENTE PRINCIPAL
===================================================== */

export default function MentorEvidenceDetail({
  bookingId,
}: {
  bookingId: string;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [modalAgreementId, setModalAgreementId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const previousFocusRef = useRef<HTMLElement | null>(null);

  /* =====================================================
     CONSULTAR EVIDENCIAS
  ===================================================== */

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetail() {
      try {
        setLoading(true);
        setError("");
        setDetail(null);
        setModalAgreementId(null);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (controller.signal.aborted) {
          return;
        }

        if (sessionError || !session?.access_token) {
          throw new Error("No se encontró la sesión activa.");
        }

        const response = await fetch(
          `/api/mentors/evidencias/detalle?bookingId=${encodeURIComponent(
            bookingId,
          )}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        const data: unknown = await response.json();

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          const message =
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : "No se pudieron cargar las evidencias.";

          throw new Error(message);
        }

        if (
          !data ||
          typeof data !== "object" ||
          !("items" in data) ||
          !Array.isArray(data.items) ||
          !("mentee" in data) ||
          !data.mentee ||
          typeof data.mentee !== "object"
        ) {
          throw new Error("El servidor devolvió un formato inesperado.");
        }

        setDetail(data as DetailResponse);
      } catch (loadError) {
        if (
          controller.signal.aborted ||
          (loadError instanceof Error && loadError.name === "AbortError")
        ) {
          return;
        }

        console.error("Error cargando evidencias:", loadError);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las evidencias.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      controller.abort();
    };
  }, [bookingId]);

  /* =====================================================
     HISTORIAL DE EVIDENCIAS
  ===================================================== */

  const items = detail?.items ?? [];

  const selectedItem = items.find(
    (item) => item.agreement.id === modalAgreementId,
  );

  const modalEvidence = selectedItem
    ? sortEvidence(selectedItem.evidencias ?? [])
    : [];

  function openModal(agreementId: string, trigger: HTMLElement) {
    previousFocusRef.current = trigger;
    setModalAgreementId(agreementId);
  }

  function closeModal() {
    setModalAgreementId(null);
  }

  /* =====================================================
     ACCESIBILIDAD DEL MODAL
  ===================================================== */

  useEffect(() => {
    if (!modalAgreementId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalAgreementId(null);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const modal = modalRef.current;

      if (!modal) return;

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      ).filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) {
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

      document.removeEventListener("keydown", handleKeyDown);

      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [modalAgreementId]);

  /* =====================================================
     INTERFAZ
  ===================================================== */

  return (
    <main className={`page-content ${styles.mentorPage}`}>
      {/* ENCABEZADO */}

      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Revisión de acuerdos y evidencias</h1>

        <p className={styles.pageDescription}>
          Se revisa los acuerdos y las evidencias enviadas por el Mentee.
        </p>
      </header>

      <Link href="/evidencias" className={styles.backLink}>
        <ArrowLeft size={16} />
        Volver a Repositorio de Evidencias
      </Link>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className={styles.emptyPage}>
          <h2>Cargando evidencias...</h2>

          <p>
            Estamos consultando los archivos registrados para esta mentoría.
          </p>
        </div>
      ) : !detail ? (
        !error && (
          <div className={styles.emptyPage}>No se encontró información.</div>
        )
      ) : (
        <>
          {/* ======================================
              RESUMEN DEL MENTEE
          ====================================== */}

          <section
            className={styles.menteeSummary}
            aria-label="Información del mentee"
          >
            <div className={styles.studentIdentity}>
              {/* FOTO REAL O ÍCONO DE RESPALDO */}

              <div className={styles.studentAvatarFrame}>
                <MenteeAvatar
                  nombre={detail.mentee.nombre}
                  fotoUrl={detail.mentee.fotoUrl ?? null}
                />
              </div>

              <div className={styles.studentInfo}>
                <span className={styles.studentLabel}>
                  {detail.mentee.participantes > 1
                    ? "Participante principal de la mentoría"
                    : "Mentee de la mentoría"}
                </span>

                <h2>{detail.mentee.nombre}</h2>

                {detail.mentee.email && <p>{detail.mentee.email}</p>}

                {detail.mentee.participantes > 1 && (
                  <p className={styles.groupNotice}>
                    Esta cita tiene {detail.mentee.participantes} participantes.
                    El nombre mostrado no identifica necesariamente quién subió
                    cada archivo.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <strong>{detail.totalEvidencias}</strong>

                <span>

                  {detail.totalEvidencias === 1 ? "Evidencia" : "Evidencias"}
                </span>
              </div>

              <div className={styles.summaryStat}>
                <strong>{detail.totalAcuerdos}</strong>

                <span>
                  {detail.totalAcuerdos === 1
                    ? "Acuerdo con entrega"
                    : "Acuerdos con entregas"}
                </span>
              </div>
            </div>
          </section>

          {/* ======================================
              LISTADO DE ACUERDOS Y EVIDENCIAS
          ====================================== */}

          {items.length === 0 ? (
            <div className={styles.emptyPage}>
              <FolderOpen size={28} />

              <h2>No hay evidencias disponibles</h2>

              <p>
                El mentee todavía no ha enviado evidencias para esta mentoría.
              </p>
            </div>
          ) : (
            <section
              className={styles.agreementList}
              aria-label="Evidencias por acuerdo"
            >
              {items.map(({ agreement, evidencias }, index) => {
                const sortedEvidence = sortEvidence(evidencias ?? []);

                const latest = sortedEvidence[0];

                if (!latest) return null;

                return (
                  <article key={agreement.id} className={styles.agreementCard}>
                    {/* EVIDENCIAS: CONTENIDO PRINCIPAL */}

                    <section className={styles.evidenceColumn}>
                      <div className={styles.evidenceHeading}>
                        <div className={styles.evidenceHeadingTitle}>
                          <Paperclip size={19} />

                          <h3>Evidencias enviadas</h3>
                        </div>

                        <span className={styles.evidenceCount}>
                          {sortedEvidence.length}{" "}
                          {sortedEvidence.length === 1 ? "archivo" : "archivos"}
                        </span>
                      </div>

                      <p className={styles.latestLabel}>Última evidencia</p>

                      {latest.url ? (
                        <a
                          className={styles.evidenceItem}
                          href={latest.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={latest.nombre_archivo}
                        >
                          <FileText size={23} />

                          <div className={styles.evidenceInfo}>
                            <strong>{latest.nombre_archivo}</strong>

                            <span>{formatSize(latest.tamano)}</span>

                            <small>
                              Enviado el {formatDate(latest.created_at)}
                            </small>
                          </div>

                          <ExternalLink size={17} />
                        </a>
                      ) : (
                        <div className={styles.evidenceItem}>
                          <FileText size={23} />

                          <div className={styles.evidenceInfo}>
                            <strong>{latest.nombre_archivo}</strong>

                            <small>
                              Enviado el {formatDate(latest.created_at)}
                            </small>
                          </div>
                        </div>
                      )}

                      {sortedEvidence.length > 1 && (
                        <button
                          type="button"
                          className={styles.viewAllButton}
                          onClick={(event) =>
                            openModal(agreement.id, event.currentTarget)
                          }
                        >
                          <FolderOpen size={17} />
                          Ver todas las evidencias ({sortedEvidence.length})
                        </button>
                      )}
                    </section>

                    {/* ACUERDO: CONTEXTO */}

                    <section className={styles.agreementColumn}>
                      <div className={styles.agreementTop}>
                        <span className={styles.agreementNumber}>
                          ACUERDO {index + 1}
                        </span>

                        <span
                          className={
                            `${styles.statusBadge} ` +
                            statusClass(agreement.estado)
                          }
                        >
                          {agreement.estado === "cumplido" && (
                            <CheckCircle2 size={14} />
                          )}

                          {statusLabels[agreement.estado]}
                        </span>
                      </div>

                      <h2 className={styles.agreementTitle}>
                        {agreement.titulo}
                      </h2>

                      {agreement.descripcion && (
                        <p className={styles.agreementDescription}>
                          {agreement.descripcion}
                        </p>
                      )}

                      {agreement.observacion && (
                        <div className={styles.observation}>
                          <span className={styles.fieldLabel}>
                            Acuerdo del mentor con el mentee
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
                              {formatDeadline(agreement.fecha_limite)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </section>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {/* ==========================================
          MODAL DE HISTORIAL DE EVIDENCIAS
      ========================================== */}

      {selectedItem && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className={styles.evidenceModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mentor-modal-title"
            aria-describedby="mentor-modal-description"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeading}>
                <span className={styles.modalEyebrow}>
                  HISTORIAL DE EVIDENCIAS
                </span>

                <h2 id="mentor-modal-title">Evidencias enviadas</h2>

                <p id="mentor-modal-description">
                  {selectedItem.agreement.titulo}
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Cerrar historial"
              >
                <X size={21} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalCount}>
                {modalEvidence.length}{" "}
                {modalEvidence.length === 1
                  ? "evidencia enviada"
                  : "evidencias enviadas"}
              </p>

              <div className={styles.modalEvidenceList}>
                {modalEvidence.map((evidence, index) => {
                  const content = (
                    <>
                      <div className={styles.modalFileIcon}>
                        <FileText size={21} />
                      </div>

                      <div className={styles.modalFileInfo}>
                        <strong>{evidence.nombre_archivo}</strong>

                        <span>
                          {[
                            formatSize(evidence.tamano),
                            formatDate(evidence.created_at),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>

                      {index === 0 && (
                        <span className={styles.recentBadge}>Reciente</span>
                      )}

                      {evidence.url && <ExternalLink size={17} />}
                    </>
                  );

                  return evidence.url ? (
                    <a
                      key={evidence.id}
                      className={styles.modalEvidenceItem}
                      href={evidence.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={evidence.nombre_archivo}
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={evidence.id} className={styles.modalEvidenceItem}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalDone}
                onClick={closeModal}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
