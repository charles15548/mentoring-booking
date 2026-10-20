"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";

import styles from "./reservas.module.css";
import loadingStyles from "./reservas-loading.module.css";

/* =========================================================
   TIPOS
========================================================= */

type Reservation = {
  id: string;
  serviceName?: string;

  customerName?: string;
  customerEmail?: string;

  mentorId?: string;
  mentorName?: string;
  mentorEmail?: string;

  startDateTime?: {
    dateTime: string;
  };

  endDateTime?: {
    dateTime: string;
  };

  confirmedAt?: string | null;
  status?: string;
  agreementCount?: number;
};

type ReservasPageProps = {
  view?: "reservas" | "mentorias";
};

const TIME_ZONE = "America/Lima";

/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

function getStatus(item: Reservation) {
  return item.status?.toLowerCase() ?? "pendiente";
}

function getStartTime(item: Reservation) {
  const value = item.startDateTime?.dateTime;

  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

function formatDate(value?: string) {
  if (!value) return "Fecha por confirmar";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha por confirmar";
  }

  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

function formatTime(value?: string) {
  if (!value) return "Hora por confirmar";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Hora por confirmar";
  }

  return date.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatDateTime(value?: string) {
  if (!value) return "Fecha por confirmar";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha por confirmar";
  }

  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

function isCompleted(item: Reservation) {
  const start = getStartTime(item);

  return (
    getStatus(item) === "confirmada" && start !== null && start <= Date.now()
  );
}

/* =========================================================
   PÁGINA DE RESERVAS / REPOSITORIO
========================================================= */

export default function ReservasPage({ view = "reservas" }: ReservasPageProps) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isMentoriasView = view === "mentorias";

  /* =======================================================
     CARGA INICIAL
  ======================================================= */

  useEffect(() => {
    void loadReservations();
  }, []);

  async function loadReservations() {
    try {
      setLoading(true);
      setError("");

      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user?.email) {
        throw new Error("No se encontró una sesión válida.");
      }

      const response = await fetch(
        `/api/bookings?email=${encodeURIComponent(session.user.email)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        throw new Error(
          errorData?.error || `Error consultando reservas: ${response.status}`,
        );
      }

      const reservations: Reservation[] = await response.json();

      setItems(reservations);
    } catch (loadError) {
      console.error("Error cargando reservas:", loadError);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar tus reservas.",
      );

      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     CANCELAR RESERVA
  ======================================================= */

  async function cancelReservation(reservation: Reservation) {
    try {
      setCancellingId(reservation.id);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const email = session?.user?.email;

      const response = await fetch("/api/bookings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          microsoftBookingId: reservation.id,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cancelar la reserva.");
      }

      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== reservation.id),
      );
    } catch (cancelError) {
      console.error("Error cancelando reserva:", cancelError);

      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "No se pudo cancelar la reserva.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  /* =======================================================
     FILTRAR RESERVAS SEGÚN VISTA
  ======================================================= */

  const visibleItems = items
    .filter((item) =>
      isMentoriasView ? isCompleted(item) : !isCompleted(item),
    )
    .sort((first, second) => {
      const a = getStartTime(first) ?? 0;
      const b = getStartTime(second) ?? 0;

      return isMentoriasView ? b - a : a - b;
    });

  const title = isMentoriasView
    ? "Revisar acuerdos y evidencias coordinadas con mi mentor"
    : "Accediendo a mis sesiones de mentoría";

  const description = isMentoriasView
    ? "Consulta los acuerdos definidos en tus sesiones realizadas."
    : "Consulta tus mentorías programadas y verifica el estado de cada reserva.";

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="page-content">
      <section
        className={`welcome-row ${
          isMentoriasView ? styles.repositoryWelcome : ""
        }`}
      >
        <div>
          <h1 className={isMentoriasView ? styles.repositoryTitle : undefined}>
            {title}
          </h1>

          <p
            className={isMentoriasView ? styles.repositoryDescription : "intro"}
          >
            {description}
          </p>
        </div>
      </section>

      {/* ================================================
          INDICADOR INSTITUCIONAL DE CARGA
      ================================================= */}

      {loading ? (
        <ProUniLoader
          icon={isMentoriasView ? "book" : "calendar"}
          title={
            isMentoriasView
              ? "Consultando historial de mentorías"
              : "Consultando sesiones agendadas"
          }
          description={
            isMentoriasView
              ? "Un momento, estamos preparando los registros de tus mentorías realizadas."
              : "Un momento, estamos preparando la información de tus mentorías."
          }
        />
      ) : error ? (
        /* =============================================
           ERROR DE CONSULTA
        ============================================== */

        <div className={loadingStyles.errorContainer} role="alert">
          <h2>No se pudo cargar la información</h2>

          <p>{error}</p>

          <button
            type="button"
            className={loadingStyles.retryButton}
            onClick={() => void loadReservations()}
          >
            Reintentar
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        /* =============================================
           ESTADO VACÍO
        ============================================== */

        <div className="empty-state">
          <h2>
            {isMentoriasView
              ? "Aún no tienes mentorías realizadas"
              : "Aún no tienes reservas"}
          </h2>

          <p>
            {isMentoriasView
              ? "Las sesiones confirmadas aparecerán aquí a partir de su hora de inicio."
              : "Cuando reserves una mentoría aparecerá aquí."}
          </p>
        </div>
      ) : isMentoriasView ? (
        /* =============================================
           REPOSITORIO DE MENTORÍAS
        ============================================== */

        <div className={loadingStyles.contentEntrance}>
          <section
            className={styles.repositoryList}
            aria-label="Sesiones de mentoría"
          >
            {visibleItems.map((item) => {
              const agreementCount = item.agreementCount ?? 0;

              const hasAgreements = agreementCount > 0;

              return (
                <article key={item.id} className={styles.repositoryCard}>
                  <div className={styles.repositoryInfo}>
                    <p className={styles.repositoryDate}>
                      {formatDate(item.startDateTime?.dateTime)}
                    </p>

                    <p>
                      {" "}
                      <strong>{item.mentorName || "Mentor PROUNI"}</strong>
                    </p>

                    {item.mentorEmail && (
                      <p className={styles.repositoryEmail}>
                        {item.mentorEmail}
                      </p>
                    )}

                    <p
                      className={`${styles.repositoryState} ${
                        hasAgreements
                          ? styles.repositoryStateWith
                          : styles.repositoryStateWithout
                      }`}
                    >
                      {hasAgreements
                        ? "Con acuerdos registrados"
                        : "Sin acuerdos registrados"}
                    </p>
                  </div>

                  <div className={styles.repositorySide}>
                    <div className={styles.repositorySchedule}>
                      <span>Hora programada</span>

                      <strong>
                        {formatTime(item.startDateTime?.dateTime)}
                      </strong>
                    </div>

                    {hasAgreements ? (
                      <Link
                        className={styles.repositoryAction}
                        href={`/mentoriasMentee/${encodeURIComponent(item.id)}`}
                      >
                        {agreementCount === 1
                          ? "Ver 1 acuerdo"
                          : `Ver ${agreementCount} acuerdos`}
                      </Link>
                    ) : (
                      <span className={styles.repositoryNoAction}>
                        Sin acuerdos disponibles
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <p className={styles.repositoryCount}>
            {visibleItems.length}{" "}
            {visibleItems.length === 1 ? "mentoría" : "mentorías"}
          </p>
        </div>
      ) : (
        /* =============================================
           SESIONES AGENDADAS
        ============================================== */

        <section
          className={`reservation-list ${loadingStyles.contentEntrance}`}
        >
          {visibleItems.map((item) => {
            const status = getStatus(item);

            const statusLabel =
              status === "pendiente"
                ? "Pendiente de confirmación"
                : status === "confirmada"
                  ? "Sesión confirmada"
                  : item.status || "Sin estado";

            return (
              <article className="reservation-card" key={item.id}>
                <div>
                  <p
                    className={`eyebrow ${
                      status === "confirmada"
                        ? "eyebrow-confirmed"
                        : status === "pendiente"
                          ? "eyebrow-pending"
                          : "eyebrow-vencida"
                    }`}
                  >
                    {statusLabel}
                  </p>

                  <h2>{item.mentorName || "Mentor PROUNI"}</h2>

                  {item.mentorEmail && <p>{item.mentorEmail}</p>}

                  {status === "confirmada" && item.confirmedAt && (
                    <p>Confirmada el {formatDateTime(item.confirmedAt)}</p>
                  )}
                </div>

                <div className={styles.reservationActions}>
                  <time>{formatDateTime(item.startDateTime?.dateTime)}</time>

                  <button
                    className={styles.cancelButton}
                    type="button"
                    onClick={() => cancelReservation(item)}
                    disabled={status !== "pendiente" || cancellingId !== null}
                    title={
                      status === "confirmada"
                        ? "No puedes cancelar una mentoría confirmada."
                        : status === "pendiente"
                          ? "Cancelar esta reserva"
                          : "La cancelación no está disponible."
                    }
                  >
                    {cancellingId === item.id
                      ? "Cancelando..."
                      : "Cancelar reserva"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
