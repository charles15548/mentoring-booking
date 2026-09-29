"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import agreementStyles from "./mentor-agreements.module.css";

type Mentorship = {
  id: string;
  serviceName?: string;
  menteeName?: string;
  menteeEmail?: string;
  startDateTime?: {
    dateTime: string;
  };
  endDateTime?: {
    dateTime: string;
  };
  onlineMeetingUrl?: string;
  confirmedAt?: string | null;
  status?: string;
};

type MentorAppointmentsProps = {
  view: "reservas" | "mentorias";
};

function getStatus(item: Mentorship) {
  return item.status?.toLowerCase() ?? "pendiente";
}

function getStartTime(item: Mentorship) {
  const value = item.startDateTime?.dateTime;
  const time = value ? new Date(value).getTime() : Number.NaN;

  return Number.isNaN(time) ? null : time;
}

function isCompletedMentorship(item: Mentorship) {
  const startTime = getStartTime(item);

  return getStatus(item) === "confirmada" && startTime !== null && startTime <= Date.now();
}

function formatDate(value?: string) {
  if (!value) {
    return "Fecha por confirmar";
  }

  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

export default function MentorAppointments({ view }: MentorAppointmentsProps) {
  const [items, setItems] = useState<Mentorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadMentorships();
  }, []);

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
        console.error("Error API reservas:", data);
        setError(data.error || "No se pudieron cargar tus mentorías.");
        return;
      }

      setItems(data as Mentorship[]);
    } catch (loadError) {
      console.error("Error cargando mentorías:", loadError);
      setError("No se pudieron cargar tus mentorías.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmMentorship(microsoftBookingId: string) {
    try {
      setConfirmingId(microsoftBookingId);
      setError("");

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
        body: JSON.stringify({ microsoftBookingId }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error confirmando mentoría:", data);
        setError(data.error || "No se pudo confirmar la mentoría.");
        return;
      }

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === microsoftBookingId
            ? {
                ...item,
                confirmedAt: data.confirmed_at ?? new Date().toISOString(),
                status: "confirmada",
              }
            : item,
        ),
      );
    } catch (confirmationError) {
      console.error("Error confirmando mentoría:", confirmationError);
      setError("No se pudo confirmar la mentoría.");
    } finally {
      setConfirmingId(null);
    }
  }

  const visibleItems = useMemo(() => {
    const matchingItems = items.filter((item) =>
      view === "mentorias" ? isCompletedMentorship(item) : !isCompletedMentorship(item),
    );

    return matchingItems.sort((first, second) => {
      const firstTime = getStartTime(first) ?? 0;
      const secondTime = getStartTime(second) ?? 0;

      return view === "mentorias" ? secondTime - firstTime : firstTime - secondTime;
    });
  }, [items, view]);

  const isMentoriasView = view === "mentorias";
  const title = isMentoriasView ? "Mentorías" : "Mis reservas";
  const description = isMentoriasView
    ? "Consulta las sesiones confirmadas que ya se realizaron."
    : "Gestiona tus reuniones pendientes y las confirmadas que aún no se realizan.";
  const emptyTitle = isMentoriasView
    ? "Aún no tienes mentorías realizadas"
    : "Aún no tienes reservas";
  const emptyDescription = isMentoriasView
    ? "Cuando una reunión confirmada finalice, aparecerá aquí."
    : "Cuando tengas una sesión programada aparecerá aquí.";

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <h1>{title}</h1>
          <p className="intro">{description}</p>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="empty-state">
          <h2>Cargando {isMentoriasView ? "mentorías" : "reservas"}...</h2>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        <section className="reservation-list">
          {visibleItems.map((item) => {
            const status = getStatus(item);
            const canConfirm =
              !isMentoriasView &&
              status === "pendiente";

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
                    {isMentoriasView ? "Realizada" : status}
                  </p>

                  <h2>{item.serviceName || "Sesión de mentoría"}</h2>
                  <p>
                    Mentee: <strong>{item.menteeName || "Mentee PROUNI"}</strong>
                  </p>

                  {item.menteeEmail && <p>{item.menteeEmail}</p>}

                  {status === "confirmada" && item.confirmedAt && (
                    <p>Confirmada el {formatDate(item.confirmedAt)}</p>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <time
                    style={{
                      backgroundColor: "#f8f9fa",
                      border: "1px solid #e5e7eb",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      minWidth: "180px",
                      textAlign: "center",
                    }}
                  >
                    {formatDate(item.startDateTime?.dateTime)}
                  </time>

                  {canConfirm && (
                    <button
                      type="button"
                      onClick={() => confirmMentorship(item.id)}
                      disabled={confirmingId === item.id}
                      style={{
                        minWidth: "180px",
                        padding: "10px 16px",
                        border: "none",
                        borderRadius: "10px",
                        backgroundColor:
                          confirmingId === item.id ? "#d1d5db" : "var(--wine)",
                        color: "#ffffff",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor:
                          confirmingId === item.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {confirmingId === item.id
                        ? "Confirmando..."
                        : "Confirmar mentoría"}
                    </button>
                  )}

                  {!isMentoriasView && item.onlineMeetingUrl && status === "confirmada" && (
                    <a href={item.onlineMeetingUrl} target="_blank" rel="noreferrer">
                      Unirse a la reunión
                    </a>
                  )}

                  {isMentoriasView && (
                    <Link
                      className={agreementStyles.manageLink}
                      href={`/mentorias/${encodeURIComponent(item.id)}`}
                    >
                      Gestionar acuerdos
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
