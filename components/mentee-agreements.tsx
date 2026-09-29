"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./mentor-agreements.module.css";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: "pendiente" | "en_progreso" | "cumplido" | "cancelado";
  fecha_limite: string | null;
};
const labels: Record<Agreement["estado"], string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cumplido: "Cumplido",
  cancelado: "Cancelado",
};

export default function MenteeAgreements({ bookingId }: { bookingId: string }) {
  const [items, setItems] = useState<Agreement[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function call(path: string, init?: RequestInit) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token)
      throw new Error("No se encontró la sesión activa.");
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }

  useEffect(() => {
    void (async () => {
      try {
        setItems(
          await call(
            `/api/mentee/acuerdos?bookingId=${encodeURIComponent(bookingId)}`,
          ),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los acuerdos.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId]);

  async function changeStatus(id: string, estado: Agreement["estado"]) {
    try {
      setError("");
      const updated = await call("/api/mentee/acuerdos", {
        method: "PATCH",
        body: JSON.stringify({ id, estado }),
      });
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el estado.",
      );
    }
  }

  return (
    <main className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MENTORÍA REALIZADA</p>
          <h1>Mis acuerdos</h1>
          <p className="intro">
            Revisa los compromisos definidos con tu mentor y actualiza tu
            avance.
          </p>
        </div>
      </section>
      <Link className={styles.backLink} href="/mentoriasMentee">
        ← Volver a Mentorías
      </Link>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <div className="empty-state">
          <h2>Cargando acuerdos...</h2>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>No hay acuerdos registrados</h2>
          <p>Tu mentor aún no ha registrado acuerdos para esta sesión.</p>
        </div>
      ) : (
        <section className="reservation-list">
          {items.map((item) => (
            <article className="reservation-card" key={item.id}>
              <div>
                <p className="eyebrow">{labels[item.estado]}</p>
                <h2>{item.titulo}</h2>
                {item.descripcion && <p>{item.descripcion}</p>}
                {item.observacion && (
                  <p>
                    <strong>Observación:</strong> {item.observacion}
                  </p>
                )}
                {item.fecha_limite && (
                  <p>
                    <strong>Fecha límite:</strong>{" "}
                    {new Date(
                      `${item.fecha_limite}T00:00:00`,
                    ).toLocaleDateString("es-PE")}
                  </p>
                )}
              </div>
              <label className={styles.statusControl}>
                Mi avance
                <select
                  value={item.estado}
                  onChange={(event) =>
                    changeStatus(
                      item.id,
                      event.target.value as Agreement["estado"],
                    )
                  }
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
