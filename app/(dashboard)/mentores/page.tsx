"use client";

import { useEffect, useState } from "react";

import Horarios from "./Horarios";
import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";

type Mentor = {
  id: string;
  name: string;
  email: string;
};

export default function MentoresPage() {
  const [mentores, setMentores] = useState<Mentor[]>([]);

  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function cargarMentores() {
      try {
        setIsLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const response = await fetch("/api/mentors", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudieron obtener los mentores.");
        }

        setMentores(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los mentores.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void cargarMentores();
  }, []);

  return (
    <div className="page-content">
      {/* =====================================================
          CABECERA
          Siempre visible, incluso durante la carga
      ===================================================== */}

      <section className="welcome-row">
        <div>
          <h1 className="mentores-page-title">
            Elige uno de los horarios disponibles de tu mentor
          </h1>

          <p className="intro">
            Selecciona fecha y hora según disponibilidad del mentor.
          </p>
        </div>
      </section>

      {/* =====================================================
          CONTENIDO
          Solo esta sección cambia durante la consulta
      ===================================================== */}

      {isLoading ? (
        <ProUniLoader
          icon="calendar-clock"
          title="Consultando mentores disponibles"
          description="Un momento, estamos preparando la información para agendar tu mentoría."
        />
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : mentores.length === 0 ? (
        <section className="empty-state">
          <h2>No hay mentores disponibles</h2>
        </section>
      ) : (
        <section className="mentor-picker">
          {mentores.map((mentor) => (
            <button
              key={mentor.id}
              type="button"
              className={`mentor-option ${
                selectedMentor?.id === mentor.id ? "selected" : ""
              }`}
              onClick={() => setSelectedMentor(mentor)}
            >
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <strong
                  style={{
                    display: "block",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    lineHeight: 1.4,
                  }}
                >
                  {mentor.name}
                </strong>

                <small
                  style={{
                    display: "block",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    lineHeight: 1.4,
                  }}
                >
                  {mentor.email}
                </small>
              </span>

              <b
                style={{
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                →
              </b>
            </button>
          ))}
        </section>
      )}

      {/* =====================================================
          CALENDARIO DEL MENTOR SELECCIONADO
      ===================================================== */}

      {!isLoading && !error && selectedMentor && (
        <Horarios
          mentor={selectedMentor}
          onClose={() => setSelectedMentor(null)}
        />
      )}
    </div>
  );
}
