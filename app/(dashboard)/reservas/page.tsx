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

  status?: string;
};

export default function ReservasPage() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user?.email) {
        setError("No se encontró la sesión activa.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/bookings?email=${encodeURIComponent(data.user.email)}`,
      );

      if (!response.ok) {
        setError("No se pudieron cargar tus reservas.");
      } else {
        setItems((await response.json()) as Reservation[]);
      }

      setLoading(false);
    })();
  }, []);

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MI AGENDA</p>
          <h1>Mis mentorías</h1>

          <p className="intro">
            Consulta tus sesiones programadas con tus mentores.
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
                <p className="eyebrow">
                  {item.status || "CONFIRMADA"}
                </p>

                <h2>
                  {item.serviceName || "Sesión de mentoría"}
                </h2>

                <p>
                  Mentor:{" "}
                  <strong>
                    {item.mentorName || "Mentor PROUNI"}
                  </strong>
                </p>

                {item.mentorEmail && (
                  <p>{item.mentorEmail}</p>
                )}
              </div>

              <time>
                {item.startDateTime
                  ? new Date(
                      item.startDateTime.dateTime,
                    ).toLocaleString("es-PE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Lima",
                    })
                  : "Fecha por confirmar"}
              </time>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}