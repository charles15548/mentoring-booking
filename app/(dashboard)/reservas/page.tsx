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

  useEffect(() => {
    void loadReservations();
  }, []);

// async function loadReservations() {
//   try {
//     setLoading(true);
//     setError("");

//     const {
//       data: { session },
//     } =
//       await supabase.auth.getSession();

//     const response = await fetch(
//       "/api/bookings",
//       {
//         method: "GET",
//         cache: "no-store",
//         headers: {
//           Authorization:
//             `Bearer ${session?.access_token}`,
//         },
//       },
//     );

//     const reservations =
//       await response.json();

//     if (!response.ok) {
//       setError(
//         reservations.error ||
//           "No se pudieron cargar tus reservas.",
//       );

//       return;
//     }

//     setItems(
//       reservations as Reservation[],
//     );
//   } catch (error) {
//     console.error(
//       "Error cargando reservas:",
//       error,
//     );

//     setError(
//       "No se pudieron cargar tus reservas.",
//     );
//   } finally {
//     setLoading(false);
//   }
// }

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
        errorData?.error ||
          `Error consultando reservas: ${response.status}`,
      );
    }

    const reservations: Reservation[] =
      await response.json();

    setItems(reservations);
  } catch (error) {
    console.error(
      "Error cargando reservas:",
      error,
    );

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

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <h1>Mis Reservas</h1>

          <p className="intro">
            Consulta tus sesiones programadas
            con tus mentores.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="empty-state">
          <h2>Cargando reservas...</h2>
        </div>
      ) : error ? (
        <p className="form-error">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>
            Aún no tienes reservas
          </h2>

          <p>
            Cuando reserves una mentoría
            aparecerá aquí.
          </p>
        </div>
      ) : (
        <section className="reservation-list">
          {items.map((item) => (
            <article
              className="reservation-card"
              key={item.id}
            >
              <div>
                <p
                  className={`eyebrow ${
                    item.confirmed
                      ? "eyebrow-confirmed"
                      : "eyebrow-pending"
                  }`}
                >
                  {item.status ||
                    "Pendiente"}
                </p>

                <h2>
                  {item.serviceName ||
                    "Sesión de mentoría"}
                </h2>

                <p>
                  Mentor:{" "}
                  <strong>
                    {item.mentorName ||
                      "Mentor PROUNI"}
                  </strong>
                </p>

                {item.mentorEmail && (
                  <p>
                    {item.mentorEmail}
                  </p>
                )}

                {item.confirmed &&
                  item.confirmedAt && (
                    <p>
                      Confirmada el{" "}
                      {new Date(
                        item.confirmedAt,
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
                      )}
                    </p>
                  )}
              </div>

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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}