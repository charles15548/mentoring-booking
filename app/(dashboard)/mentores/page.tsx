"use client";

import {
  useEffect,
  useState,
} from "react";

import Horarios from "./Horarios";

type Mentor = {
  id: string;
  name: string;
  email: string;
};

export default function MentoresPage() {
  const [mentores, setMentores] =
    useState<Mentor[]>([]);

  const [selectedMentor, setSelectedMentor] =
    useState<Mentor | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function cargarMentores() {
      try {
        setIsLoading(true);

        const response =
          await fetch("/api/mentors");

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "No se pudieron obtener los mentores.",
          );
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

  if (isLoading) {
    return (
      <div className="page-content">
        <section className="empty-state">
          <h2>Cargando mentores...</h2>
        </section>
      </div>
    );
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">
            PROUNI · MENTORÍAS
          </p>

          <h1>
            Elige tu mentor
          </h1>

          <p className="intro">
      Selecciona un mentor para consultar sus horarios disponibles y reservar una sesión.
          </p>
        </div>
      </section>

      {error && (
        <p className="form-error">
          {error}
        </p>
      )}

      {mentores.length === 0 ? (
        <section className="empty-state">
          <h2>
            No hay mentores disponibles
          </h2>
        </section>
      ) : (
        <section className="mentor-picker">
          {mentores.map((mentor) => (
            <button
              key={mentor.id}
              className={`mentor-option ${
                selectedMentor?.id === mentor.id
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setSelectedMentor(mentor)
              }
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

      {selectedMentor && (
        <Horarios
          mentor={selectedMentor}
          onClose={() =>
            setSelectedMentor(null)
          }
        />
      )}
    </div>
  );
}