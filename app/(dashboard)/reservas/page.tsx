"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

  confirmed?: boolean;
  confirmedAt?: string | null;
  status?: string;
};

export default function ReservasPage() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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

      const email = session.user.email;

      const response = await fetch(
        `/api/bookings?email=${encodeURIComponent(email)}`,
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
    } catch (error) {
      console.error("Error cargando reservas:", error);

      setError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar tus reservas.",
      );

      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function cancelReservation(reservation:Reservation) {
    try{
      setCancellingId(reservation.id);
      setError("");
      const {data: {session} } = await supabase.auth.getSession();
      const email = session?.user?.email;
      const response = await fetch("/api/bookings",
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
            microsoftBookingId:
              reservation.id,
            email,
        }),
      });
      const data = await response.json();
       if (!response.ok) {
      throw new Error(
        data.error ||
          "No se pudo cancelar la reserva.",
      );
    }
          setItems(
      (currentItems) =>
        currentItems.filter(
          (item) =>
            item.id !==
            reservation.id,
        ),
    );
    }catch(error){
          console.error(
      "Error cancelando reserva:",
      error,
    );

    setError(
      error instanceof Error
        ? error.message
        : "No se pudo cancelar la reserva.",
    );
    } finally{
      setCancellingId(null);
    }
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <h1>Mis Reservas</h1>

          <p className="intro">
            Consulta tus mentorías programadas y verifica el estado de cada
            reserva.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="empty-state">
          <h2>Cargando reservas...</h2>
        </div>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>Aún no tienes reservas</h2>

          <p>Cuando reserves una mentoría aparecerá aquí.</p>
        </div>
      ) : (
        <section className="reservation-list">
          {items.map((item) => (
            <article className="reservation-card" key={item.id}>
              <div>
                <p
                  className={`eyebrow ${
                    item.status == "confirmada" ? "eyebrow-confirmed" : item.status == "pendiente" ? "eyebrow-pending" : "eyebrow-vencida"
                  }`}
                >
                  {item.status || "Pendiente"}
                </p>

                <h2>{item.serviceName || "Sesión de mentoría"}</h2>

                <p>
                  Mentor: <strong>{item.mentorName || "Mentor PROUNI"}</strong>
                </p>

                {item.mentorEmail && <p>{item.mentorEmail}</p>}

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
  <time>
    {item.startDateTime
      ? new Date(
          item.startDateTime
            .dateTime,
        ).toLocaleString(
          "es-PE",
          {
            dateStyle:
              "medium",

            timeStyle:
              "short",

            timeZone:
              "America/Lima",
          },
        )
      : "Fecha por confirmar"}
  </time>

  {!item.confirmed && (
    <button
      type="button"
      onClick={() =>
        cancelReservation(item)
      }
      disabled={
        cancellingId === item.id
      }
      style={{
        minWidth: "180px",
        padding: "10px 16px",
        border: "1px solid #dc2626",
        borderRadius: "10px",
        backgroundColor:
          "#ffffff",
        color: "#dc2626",
        fontSize: "14px",
        fontWeight: 600,
        cursor:
          cancellingId ===
          item.id
            ? "not-allowed"
            : "pointer",
        opacity:
          cancellingId ===
          item.id
            ? 0.6
            : 1,
      }}
    >
      {cancellingId ===
      item.id
        ? "Cancelando..."
        : "Cancelar reserva"}
    </button>
  )}
</div>


            </article>
          ))}
        </section>
      )}
    </div>
  );
}
