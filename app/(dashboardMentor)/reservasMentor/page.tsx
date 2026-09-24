"use client";

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

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

  confirmed?: boolean;
  confirmedAt?: string | null;
  status?: string;
};

export default function ReservasMentorPage() {
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
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Error obteniendo sesión:", error);

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
    } catch (error) {
      console.error("Error cargando mentorías:", error);

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
        body: JSON.stringify({
          microsoftBookingId,
        }),
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

                confirmed: true,

                confirmedAt: data.confirmed_at ?? new Date().toISOString(),

                status: "Confirmada",
              }
            : item,
        ),
      );
    } catch (error) {
      console.error("Error confirmando mentoría:", error);

      setError("No se pudo confirmar la mentoría.");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MI AGENDA</p>

          <h1>Mis Mentorías</h1>

          <p className="intro">
            Consulta las sesiones que tienes asignadas y confirma tu
            participación.
          </p>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="empty-state">
          <h2>Cargando mentorías...</h2>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>Aún no tienes mentorías asignadas</h2>

          <p>Cuando tengas una sesión programada aparecerá aquí.</p>
        </div>
      ) : (
        <section className="reservation-list">
          {items.map((item) => (
            <article className="reservation-card" key={item.id}>
              <div>
                <p
                  className={`eyebrow ${
                    item.status == "confirmada"
                      ? "eyebrow-confirmed"
                      : item.status == "pendiente"
                        ? "eyebrow-pending"
                        : "eyebrow-vencida"
                  }`}
                >
                  {item.status || "Pendiente"}
                </p>

                <h2>{item.serviceName || "Sesión de mentoría"}</h2>

                <p>
                  Mentee: <strong>{item.menteeName || "Mentee PROUNI"}</strong>
                </p>

                {item.menteeEmail && <p>{item.menteeEmail}</p>}

                {item.confirmed && item.confirmedAt && (
                  <p>
                    Confirmada el{" "}
                    {new Date(item.confirmedAt).toLocaleString("es-PE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Lima",
                    })}
                  </p>
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
                  {item.startDateTime
                    ? new Date(item.startDateTime.dateTime).toLocaleString(
                        "es-PE",
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "America/Lima",
                        },
                      )
                    : "Fecha por confirmar"}
                </time>

                {!item.confirmed && (
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

                {item.onlineMeetingUrl && (
                  <a
                    href={item.onlineMeetingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Unirse a la reunión
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
