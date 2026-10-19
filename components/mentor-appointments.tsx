"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";
import styles from "./mentor-agreements.module.css";

/* =====================================================
   TIPOS
===================================================== */

type RealizacionEstado = "pendiente" | "realizada" | "no_realizada";

type Mentorship = {
  id: string;
  serviceName?: string;
  menteeName?: string;
  menteeEmail?: string;

  startDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  endDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  onlineMeetingUrl?: string;
  confirmedAt?: string | null;
  status?: string;
  agreementCount?: number;

  realizacionEstado?: RealizacionEstado;
  realizacionFecha?: string | null;
  realizacionMotivo?: string | null;
};

type MentorAppointmentsProps = {
  view: "reservas" | "mentorias";
};

type Resultado = "realizada" | "no_realizada";

const PAGE_SIZE = 10;
const TIME_ZONE = "America/Lima";

/* =====================================================
   FUNCIONES AUXILIARES
===================================================== */

function getStatus(item: Mentorship) {
  return item.status?.toLowerCase() ?? "pendiente";
}

function getRealizacionEstado(item: Mentorship): RealizacionEstado {
  if (
    item.realizacionEstado === "realizada" ||
    item.realizacionEstado === "no_realizada"
  ) {
    return item.realizacionEstado;
  }

  return "pendiente";
}

function getStartTime(item: Mentorship) {
  const raw = item.startDateTime?.dateTime;

  if (!raw) return null;

  const time = Date.parse(raw);

  return Number.isFinite(time) ? time : null;
}

function getEndTime(item: Mentorship) {
  const raw = item.endDateTime?.dateTime;

  if (!raw) return null;

  const time = Date.parse(raw);

  return Number.isFinite(time) ? time : null;
}

function isCompletedMentorship(item: Mentorship, now: number) {
  const startTime = getStartTime(item);

  return (
    getStatus(item) === "confirmada" && startTime !== null && startTime <= now
  );
}

function canFinishMentorship(item: Mentorship, now: number) {
  const endTime = getEndTime(item);

  return (
    getStatus(item) === "confirmada" &&
    getRealizacionEstado(item) === "pendiente" &&
    endTime !== null &&
    endTime <= now
  );
}

function formatDate(value?: string | null) {
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

function formatDay(value?: string) {
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

function getDayKey(time: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));

  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) {
    pages.push("...");
  }

  for (
    let number = Math.max(2, current - 1);
    number <= Math.min(total - 1, current + 1);
    number++
  ) {
    pages.push(number);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}

/* =====================================================
   ESTILOS LOCALES
===================================================== */

const statusBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 11px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const outlineButton: React.CSSProperties = {
  padding: "9px 15px",
  border: "1px solid #d7dce2",
  borderRadius: 8,
  background: "#ffffff",
  color: "#354150",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const confirmButton: React.CSSProperties = {
  padding: "9px 16px",
  border: "1px solid #81111b",
  borderRadius: 8,
  background: "#81111b",
  color: "#ffffff",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

/* =====================================================
   COMPONENTE PRINCIPAL
===================================================== */

export default function MentorAppointments({ view }: MentorAppointmentsProps) {
  const [items, setItems] = useState<Mentorship[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [resultado, setResultado] = useState<Resultado>("realizada");

  const [motivo, setMotivo] = useState("");

  const [showConfirmation, setShowConfirmation] = useState(false);

  const [query, setQuery] = useState("");

  const [dateFrom, setDateFrom] = useState("");

  const [dateTo, setDateTo] = useState("");

  const [page, setPage] = useState(1);

  const loadedRef = useRef(false);

  const [now, setNow] = useState<number | null>(null);

  const isMentoriasView = view === "mentorias";

  /* =====================================================
     RELOJ
  ===================================================== */

  useEffect(() => {
    const updateTime = () => setNow(Date.now());

    updateTime();

    const interval = window.setInterval(updateTime, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  /* =====================================================
     CARGA INICIAL
  ===================================================== */

  useEffect(() => {
    if (loadedRef.current) return;

    loadedRef.current = true;

    void loadMentorships();
  }, []);

  /* =====================================================
     AUTENTICACIÓN
  ===================================================== */

  async function getAccessToken() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Error obteniendo sesión:", sessionError);

      return null;
    }

    return session?.access_token ?? null;
  }

  /* =====================================================
     CONSULTAR MENTORÍAS
  ===================================================== */

  async function loadMentorships() {
    try {
      setLoading(true);
      setError("");

      const token = await getAccessToken();

      if (!token) {
        setError("No se encontró la sesión activa.");
        return;
      }

      const response = await fetch("/api/mentors/reservas", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudieron cargar tus mentorías.");
        return;
      }

      if (!Array.isArray(data)) {
        throw new Error("El servidor devolvió un formato inesperado.");
      }

      setItems(data as Mentorship[]);
    } catch (loadError) {
      console.error("Error cargando mentorías:", loadError);

      setError("No se pudieron cargar tus mentorías.");
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     CONFIRMAR RESERVA
  ===================================================== */

  async function confirmMentorship(microsoftBookingId: string) {
    try {
      setConfirmingId(microsoftBookingId);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      if (!token) {
        setError("No se encontró la sesión activa.");
        return;
      }

      const response = await fetch("/api/mentors/reservas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          microsoftBookingId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudo confirmar la mentoría.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === microsoftBookingId
            ? {
                ...item,
                status: "confirmada",
                confirmedAt:
                  data.confirmed_at ??
                  item.confirmedAt ??
                  new Date().toISOString(),
              }
            : item,
        ),
      );

      setSuccess("Mentoría confirmada correctamente.");
    } catch (error) {
      console.error("Error confirmando mentoría:", error);

      setError("No se pudo confirmar la mentoría.");
    } finally {
      setConfirmingId(null);
    }
  }

  /* =====================================================
     ABRIR / CERRAR FORMULARIO
  ===================================================== */

  function openFinishForm(id: string) {
    setEditingId(id);
    setResultado("realizada");
    setMotivo("");
    setShowConfirmation(false);
    setError("");
    setSuccess("");
  }

  function closeFinishForm() {
    if (savingId) return;

    setEditingId(null);
    setResultado("realizada");
    setMotivo("");
    setShowConfirmation(false);
  }

  /* =====================================================
     GUARDAR RESULTADO DE LA MENTORÍA
  ===================================================== */

  async function saveResult() {
    if (!editingId || savingId) return;

    const bookingId = editingId;

    const currentItem = items.find((item) => item.id === bookingId);

    if (
      !currentItem ||
      now === null ||
      !canFinishMentorship(currentItem, now)
    ) {
      setError("Esta mentoría no está disponible para finalizar.");
      return;
    }

    try {
      setSavingId(bookingId);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      if (!token) {
        setError("No se encontró la sesión activa.");
        return;
      }

      const response = await fetch("/api/mentors/reservas", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          microsoftBookingId: bookingId,
          realizacionEstado: resultado,
          realizacionMotivo: resultado === "no_realizada" ? motivo.trim() : "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudo guardar el resultado.");

        if (response.status === 409) {
          closeFinishForm();
          await loadMentorships();
        }

        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === bookingId
            ? {
                ...item,
                realizacionEstado: data.realizacionEstado,
                realizacionFecha: data.realizacionFecha,
                realizacionMotivo: data.realizacionMotivo,
              }
            : item,
        ),
      );

      setEditingId(null);
      setResultado("realizada");
      setMotivo("");
      setShowConfirmation(false);

      setSuccess("Guardado correctamente.");
    } catch (error) {
      console.error("Error guardando resultado:", error);

      setError("No se pudo guardar el resultado de la mentoría.");
    } finally {
      setSavingId(null);
    }
  }

  /* =====================================================
     FILTROS Y ORDEN
  ===================================================== */

  const visibleItems = useMemo(() => {
    if (now === null) return [];

    return items
      .filter((item) =>
        isMentoriasView
          ? isCompletedMentorship(item, now)
          : !isCompletedMentorship(item, now),
      )
      .sort((a, b) => {
        const firstTime = getStartTime(a) ?? 0;

        const secondTime = getStartTime(b) ?? 0;

        return isMentoriasView
          ? secondTime - firstTime
          : firstTime - secondTime;
      });
  }, [items, isMentoriasView, now]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return visibleItems.filter((item) => {
      if (term) {
        const searchableText = `${
          item.menteeName ?? ""
        } ${item.menteeEmail ?? ""}`.toLowerCase();

        if (!searchableText.includes(term)) {
          return false;
        }
      }

      if (dateFrom || dateTo) {
        const startTime = getStartTime(item);

        if (startTime === null) {
          return false;
        }

        const dayKey = getDayKey(startTime);

        if (dateFrom && dayKey < dateFrom) {
          return false;
        }

        if (dateTo && dayKey > dateTo) {
          return false;
        }
      }

      return true;
    });
  }, [visibleItems, query, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const pagedItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

  const hasActiveFilters = Boolean(query || dateFrom || dateTo);

  function clearFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  /* =====================================================
     TEXTOS
  ===================================================== */

  const title = isMentoriasView
    ? "Registrar acuerdos de mentoría"
    : "Confirmar mentorías con mis mentees";

  const description = isMentoriasView
    ? "Al finalizar la sesión de mentoría, el mentor registra los acuerdos con el mentee, que serán revisados próximamente."
    : "Revisa las solicitudes de mentoría y confirma las reuniones pendientes.";

  const emptyTitle = isMentoriasView
    ? "No hay mentorías disponibles"
    : "No tienes mentorías pendientes de confirmación";

  const emptyDescription = isMentoriasView
    ? "Las sesiones confirmadas aparecerán aquí a partir de su hora de inicio."
    : "Cuando un mentee reserve una sesión, podrás consultarla y confirmarla desde aquí.";

  /* =====================================================
     INTERFAZ
  ===================================================== */

  return (
    <div className="page-content">
      <section className={`welcome-row ${styles.appointmentWelcome}`}>
        <div>
          <h1 className={styles.appointmentHeading}>{title}</h1>

          <p className={styles.appointmentDescription}>{description}</p>
        </div>
      </section>

      {/* MENSAJES */}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          style={{
            margin: "12px 0",
            color: "#24764a",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {success}
        </p>
      )}

      {/* ======================================
          FILTROS
      ====================================== */}

      {!loading && visibleItems.length > 0 && (
        <section
          className={styles.appointmentFilters}
          aria-label="Filtros de mentorías"
        >
          <label className={styles.appointmentFieldSearch}>
            <span>Buscar mentee</span>

            <input
              className={styles.search}
              type="search"
              placeholder="Nombre o correo electrónico"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className={styles.appointmentField}>
            <span>Desde</span>

            <input
              className={styles.appointmentInput}
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className={styles.appointmentField}>
            <span>Hasta</span>

            <input
              className={styles.appointmentInput}
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className={styles.appointmentClear}
              onClick={clearFilters}
            >
              Limpiar filtros
            </button>
          )}
        </section>
      )}

      {/* ======================================
          LISTADO DE MENTORÍAS
      ====================================== */}

      {loading || now === null ? (
        <ProUniLoader
          icon={isMentoriasView ? "book" : "calendar-clock"}
          title={
            isMentoriasView
              ? "Consultando tus mentorías"
              : "Consultando solicitudes de mentoría"
          }
          description={
            isMentoriasView
              ? "Un momento, estamos consultando tus mentorías registradas."
              : "Un momento, estamos obteniendo tus solicitudes pendientes."
          }
        />
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <h2>No se encontraron resultados</h2>
          <p>Modifica el nombre, correo o rango de fechas.</p>
        </div>
      ) : (
        <>
          <section
            className={styles.appointmentList}
            aria-label="Listado de mentorías"
          >
            {pagedItems.map((item) => {
              const status = getStatus(item);

              const realization = getRealizacionEstado(item);

              const canConfirm = !isMentoriasView && status === "pendiente";

              const hasAgreements = (item.agreementCount ?? 0) > 0;

              const canFinish = now !== null && canFinishMentorship(item, now);

              const isEditing = editingId === item.id;

              const isSaving = savingId === item.id;

              return (
                <article
                  key={item.id}
                  className={`${styles.card} ${styles.appointmentCard}`}
                >
                  {/* ============================
                      DATOS DE MENTORÍA
                  ============================ */}

                  <div className={styles.appointmentMain}>
                    <p className={styles.appointmentDate}>
                      {formatDay(item.startDateTime?.dateTime)}
                    </p>

                    {/* NOMBRE DEL MENTEE */}

                    <h2 className={styles.appointmentName}>
                      {item.menteeName || "Mentee PROUNI"}
                    </h2>

                    {/* CORREO */}

                    {item.menteeEmail && (
                      <p className={styles.appointmentMeta}>
                        {item.menteeEmail}
                      </p>
                    )}

                    {isMentoriasView ? (
                      <>
                        <p
                          className={`${styles.appointmentState} ${
                            hasAgreements
                              ? styles.appointmentStateWith
                              : styles.appointmentStateWithout
                          }`}
                        >
                          {hasAgreements
                            ? "Con acuerdos registrados"
                            : "Sin acuerdos registrados"}
                        </p>

                        {/* ESTADO DE REALIZACIÓN */}

                        <div
                          style={{
                            marginTop: 12,
                          }}
                        >
                          {realization === "realizada" && (
                            <span
                              style={{
                                ...statusBase,
                                background: "#e8f5ed",
                                color: "#24764a",
                              }}
                            >
                              Mentoría Realizada
                            </span>
                          )}

                          {realization === "no_realizada" && (
                            <span
                              style={{
                                ...statusBase,
                                background: "#f1f2f4",
                                color: "#656b74",
                              }}
                            >
                              No realizada
                            </span>
                          )}

                          {realization === "pendiente" && (
                            <span
                              style={{
                                ...statusBase,
                                background: "#fff4e1",
                                color: "#94621d",
                              }}
                            >
                              Pendiente de finalizar
                            </span>
                          )}
                        </div>

                        {realization !== "pendiente" &&
                          item.realizacionFecha && (
                            <p className={styles.appointmentFootnote}>
                              Registrada el {formatDate(item.realizacionFecha)}
                            </p>
                          )}

                        {realization === "no_realizada" &&
                          item.realizacionMotivo && (
                            <p
                              className={styles.appointmentMeta}
                              style={{
                                marginTop: 8,
                              }}
                            >
                              Motivo: {item.realizacionMotivo}
                            </p>
                          )}
                      </>
                    ) : (
                      <p className={styles.appointmentMeta}>
                        Estado:{" "}
                        <strong className={styles.appointmentStatusText}>
                          {status}
                        </strong>
                      </p>
                    )}

                    {!isMentoriasView &&
                      status === "confirmada" &&
                      item.confirmedAt && (
                        <p className={styles.appointmentFootnote}>
                          Confirmada el {formatDate(item.confirmedAt)}
                        </p>
                      )}
                  </div>

                  {/* ============================
                      ACCIONES
                  ============================ */}

                  <div className={styles.appointmentSide}>
                    <div className={styles.appointmentSchedule}>
                      <span className={styles.appointmentScheduleLabel}>
                        Hora programada
                      </span>

                      <strong className={styles.appointmentScheduleTime}>
                        {formatTime(item.startDateTime?.dateTime)}
                      </strong>
                    </div>

                    {canConfirm && (
                      <button
                        type="button"
                        className={`${styles.primaryButton} ${styles.appointmentAction}`}
                        onClick={() => void confirmMentorship(item.id)}
                        disabled={confirmingId === item.id}
                      >
                        {confirmingId === item.id
                          ? "Confirmando..."
                          : "Confirmar mentoría"}
                      </button>
                    )}

                    {!isMentoriasView &&
                      item.onlineMeetingUrl &&
                      status === "confirmada" && (
                        <a
                          className={`${styles.secondaryButton} ${styles.appointmentAction}`}
                          href={item.onlineMeetingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Unirse a la reunión
                        </a>
                      )}

                    {isMentoriasView && (
                      <>
                        {canFinish && !isEditing && (
                          <button
                            type="button"
                            className={`${styles.secondaryButton} ${styles.appointmentAction}`}
                            onClick={() => openFinishForm(item.id)}
                          >
                            Finalizar mentoría
                          </button>
                        )}

                        <Link
                          className={`${styles.primaryButton} ${styles.appointmentAction}`}
                          href={`/mentorias/${encodeURIComponent(item.id)}`}
                        >
                          Gestionar acuerdos
                        </Link>
                      </>
                    )}
                  </div>

                  {/* ============================
                      FORMULARIO DE FINALIZACIÓN
                  ============================ */}

                  {isMentoriasView && isEditing && canFinish && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        width: "100%",
                        padding: 18,
                        marginTop: 12,
                        background: "#fafbfc",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                      }}
                    >
                      <h3
                        style={{
                          margin: "0 0 7px",
                          color: "#30343b",
                          fontSize: 17,
                          fontWeight: 750,
                        }}
                      >
                        {resultado === "realizada"
                          ? "Finalizar mentoría"
                          : "Registrar sesión no realizada"}
                      </h3>

                      <p
                        style={{
                          margin: "0 0 15px",
                          color: "#647080",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        {resultado === "realizada"
                          ? "Confirma que esta sesión se llevó a cabo. Los acuerdos registrados se conservarán."
                          : "Indica que esta sesión no se llevó a cabo. No será contabilizada como realizada en el reporte mensual."}
                      </p>

                      {!showConfirmation && (
                        <>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 12,
                              marginBottom: 14,
                            }}
                          >
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                fontSize: 14,
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="radio"
                                name={`resultado-${item.id}`}
                                checked={resultado === "realizada"}
                                onChange={() => setResultado("realizada")}
                              />
                              Se realizó
                            </label>

                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                fontSize: 14,
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="radio"
                                name={`resultado-${item.id}`}
                                checked={resultado === "no_realizada"}
                                onChange={() => setResultado("no_realizada")}
                              />
                              No se realizó
                            </label>
                          </div>

                          {resultado === "no_realizada" && (
                            <label
                              style={{
                                display: "block",
                                marginBottom: 15,
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  marginBottom: 7,
                                  fontSize: 13,
                                  color: "#47515e",
                                  fontWeight: 650,
                                }}
                              >
                                Motivo (opcional)
                              </span>

                              <textarea
                                value={motivo}
                                onChange={(event) =>
                                  setMotivo(event.target.value)
                                }
                                maxLength={1000}
                                rows={3}
                                placeholder="Indica por qué no se realizó la mentoría."
                                style={{
                                  width: "100%",
                                  padding: 11,
                                  boxSizing: "border-box",
                                  border: "1px solid #d7dce2",
                                  borderRadius: 8,
                                  resize: "vertical",
                                  fontFamily: "inherit",
                                  fontSize: 14,
                                }}
                              />
                            </label>
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              style={outlineButton}
                              onClick={closeFinishForm}
                            >
                              Cancelar
                            </button>

                            <button
                              type="button"
                              style={confirmButton}
                              onClick={() => setShowConfirmation(true)}
                            >
                              Continuar
                            </button>
                          </div>
                        </>
                      )}

                      {showConfirmation && (
                        <div
                          style={{
                            padding: 14,
                            border: "1px solid #e8d3d6",
                            borderRadius: 9,
                            background: "#ffffff",
                          }}
                        >
                          <p
                            style={{
                              margin: "0 0 13px",
                              color: "#30343b",
                              fontSize: 14,
                              lineHeight: 1.6,
                            }}
                          >
                            {resultado === "realizada"
                              ? "¿Confirmas que esta mentoría se realizó y deseas finalizarla?"
                              : "¿Confirmas que esta mentoría no se realizó?"}
                          </p>

                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              style={outlineButton}
                              disabled={isSaving}
                              onClick={() => setShowConfirmation(false)}
                            >
                              Volver
                            </button>

                            <button
                              type="button"
                              style={{
                                ...confirmButton,
                                opacity: isSaving ? 0.65 : 1,
                              }}
                              disabled={isSaving}
                              onClick={() => void saveResult()}
                            >
                              {isSaving
                                ? "Guardando..."
                                : "Confirmar y guardar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          {/* ======================================
              PAGINACIÓN
          ====================================== */}

          <nav className={styles.appointmentPagination} aria-label="Paginación">
            <p className={styles.appointmentPaginationText}>
              {totalPages > 1
                ? `Mostrando ${startIndex + 1}–${Math.min(
                    startIndex + PAGE_SIZE,
                    filteredItems.length,
                  )} de ${filteredItems.length} mentorías`
                : hasActiveFilters
                  ? `${filteredItems.length} mentorías encontradas`
                  : `${filteredItems.length} mentorías`}
            </p>

            {totalPages > 1 && (
              <div className={styles.appointmentPageControls}>
                <button
                  type="button"
                  className={styles.appointmentPageButton}
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>

                {getPageNumbers(currentPage, totalPages).map(
                  (pageNumber, index) =>
                    pageNumber === "..." ? (
                      <span
                        key={`ellipsis-${index}`}
                        className={styles.appointmentEllipsis}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`${styles.appointmentPageButton} ${
                          pageNumber === currentPage
                            ? styles.appointmentPageActive
                            : ""
                        }`}
                        onClick={() => setPage(pageNumber)}
                        aria-current={
                          pageNumber === currentPage ? "page" : undefined
                        }
                      >
                        {pageNumber}
                      </button>
                    ),
                )}

                <button
                  type="button"
                  className={styles.appointmentPageButton}
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </button>
              </div>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
