"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import ModalAsignacion from "./ModalAsignacion";

import "./asignacion.css";

export type Person = {
  id: string;

  profileId?: string | null;

  nombres?: string;

  apellidos?: string;

  name?: string;

  email: string;

  especialidad?: string;

  foto_url?: string;
};

export type AssignmentGroup = {
  mentor: Person;

  mentees: Person[];
};

export default function AsignacionPage() {
  const [
    assignments,
    setAssignments,
  ] = useState<AssignmentGroup[]>([]);

  const [
    mentees,
    setMentees,
  ] = useState<Person[]>([]);

  const [
    mentors,
    setMentors,
  ] = useState<Person[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    editing,
    setEditing,
  ] =
    useState<AssignmentGroup | null>(
      null,
    );

  const [error, setError] =
    useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function getToken() {
    const {
      data: { session },
    } =
      await supabase.auth.getSession();

    return session?.access_token;
  }

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const token =
        await getToken();

      const headers = {
        Authorization:
          `Bearer ${token}`,
      };

      const [
        assignmentsResponse,
        menteesResponse,
        mentorsResponse,
      ] = await Promise.all([
        fetch(
          "/api/coordinador/asignacion",
          {
            headers,
            cache: "no-store",
          },
        ),

        fetch(
          "/api/coordinador/gestionMentees",
          {
            headers,
            cache: "no-store",
          },
        ),

        fetch(
          "/api/coordinador/gestionMentores",
          {
            headers,
            cache: "no-store",
          },
        ),
      ]);

      const assignmentData =
        await assignmentsResponse.json();

      const menteesData =
        await menteesResponse.json();

      const mentorsData =
        await mentorsResponse.json();

      if (!assignmentsResponse.ok) {
        throw new Error(
          assignmentData.error ||
            "No se pudieron cargar las asignaciones.",
        );
      }

      setAssignments(
        assignmentData,
      );

      setMentees(
        menteesData
          .filter(
            (item: Person) =>
              item.profileId,
          )
          .map(
            (item: Person) => ({
              ...item,
              id:
                item.profileId!,
            }),
          ),
      );

      setMentors(
        mentorsData
          .filter(
            (item: Person) =>
              item.profileId,
          )
          .map(
            (item: Person) => ({
              ...item,
              id:
                item.profileId!,
            }),
          ),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las asignaciones.",
      );
    } finally {
      setLoading(false);
    }
  }

  function personName(
    person: Person,
  ) {
    return (
      [
        person.nombres,
        person.apellidos,
      ]
        .filter(Boolean)
        .join(" ") ||
      person.name ||
      person.email
    );
  }

  const filtered =
    useMemo(() => {
      const value =
        search
          .trim()
          .toLowerCase();

      if (!value) {
        return assignments;
      }

      return assignments.filter(
        (group) => {
          const mentorText =
            `${personName(
              group.mentor,
            )} ${
              group.mentor.email
            }`
              .toLowerCase();

          const menteesText =
            group.mentees
              .map(
                (mentee) =>
                  `${personName(
                    mentee,
                  )} ${
                    mentee.email
                  }`,
              )
              .join(" ")
              .toLowerCase();

          return (
            mentorText.includes(
              value,
            ) ||
            menteesText.includes(
              value,
            )
          );
        },
      );
    }, [
      assignments,
      search,
    ]);

  const totalAssignments =
    assignments.reduce(
      (total, group) =>
        total +
        group.mentees.length,
      0,
    );

  const totalMentees =
    new Set(
      assignments.flatMap(
        (group) =>
          group.mentees.map(
            (mentee) =>
              mentee.id,
          ),
      ),
    ).size;

  function openCreate() {
    setEditing(null);

    setModalOpen(true);
  }

  function openEdit(
    group: AssignmentGroup,
  ) {
    setEditing(group);

    setModalOpen(true);
  }

  async function removeMentee(
    mentorId: string,
    menteeId: string,
  ) {
    const confirmed =
      window.confirm(
        "¿Quitar este mentee del mentor?",
      );

    if (!confirmed) return;

    const token =
      await getToken();

    await fetch(
      `/api/coordinador/asignacion?mentorId=${mentorId}&menteeId=${menteeId}`,
      {
        method: "DELETE",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      },
    );

    await loadData();
  }

  async function removeMentorAssignments(
    mentorId: string,
  ) {
    const confirmed =
      window.confirm(
        "¿Eliminar todas las asignaciones de este mentor?",
      );

    if (!confirmed) return;

    const token =
      await getToken();

    await fetch(
      `/api/coordinador/asignacion?mentorId=${mentorId}`,
      {
        method: "DELETE",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      },
    );

    await loadData();
  }

  return (
    <div className="assignment-page">

      <div className="assignment-header">
        <div>
          <p className="assignment-eyebrow">
            GESTIÓN DE MENTORÍAS
          </p>

          <h1>
            Asignación de mentores
          </h1>

          <p className="assignment-description">
            Administra los mentees
            asignados a cada mentor.
          </p>
        </div>

        <button
          type="button"
          className="assignment-primary-button"
          onClick={openCreate}
        >
          + Nueva asignación
        </button>
      </div>

      {error && (
        <div className="assignment-error">
          {error}
        </div>
      )}

      <section className="assignment-stats">

        <div className="assignment-stat-card">
          <span>
            Mentores con asignaciones
          </span>

          <strong>
            {assignments.length}
          </strong>
        </div>

        <div className="assignment-stat-card">
          <span>
            Mentees asignados
          </span>

          <strong>
            {totalMentees}
          </strong>
        </div>

        <div className="assignment-stat-card">
          <span>
            Asignaciones totales
          </span>

          <strong>
            {totalAssignments}
          </strong>
        </div>

      </section>

      <section className="assignment-panel">

        <div className="assignment-toolbar">
          <div>
            <h2>
              Asignaciones actuales
            </h2>

            <p>
              Visualiza qué mentees
              tiene asignado cada mentor.
            </p>
          </div>

          <input
            className="assignment-search"
            type="text"
            placeholder="Buscar mentor o mentee..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value,
              )
            }
          />
        </div>

        {loading ? (
          <div className="assignment-empty">
            Cargando asignaciones...
          </div>
        ) : filtered.length ===
          0 ? (
          <div className="assignment-empty">
            <h3>
              No hay asignaciones
            </h3>

            <p>
              Crea una nueva
              asignación para comenzar.
            </p>
          </div>
        ) : (
          <div className="assignment-list">

            {filtered.map(
              (group) => (
                <article
                  className="assignment-row"
                  key={
                    group.mentor.id
                  }
                >

                  <div className="assignment-mentor">

                    

                    <div className="assignment-person-data">
                      <strong>
                        {personName(
                          group.mentor,
                        )}
                      </strong>

                      <span>
                        {
                          group.mentor
                            .email
                        }
                      </span>

                      {group.mentor
                        .especialidad && (
                        <small>
                          {
                            group.mentor
                              .especialidad
                          }
                        </small>
                      )}
                    </div>

                  </div>

                  <div className="assignment-mentees">

                    <span className="assignment-label">
                      Mentees asignados
                    </span>

                    <div className="assignment-tags">

                      {group.mentees.map(
                        (mentee) => (
                          <div
                            className="assignment-tag"
                            key={
                              mentee.id
                            }
                          >
                            <span>
                              {personName(
                                mentee,
                              )}
                            </span>

                            <button
                              type="button"
                              title="Quitar mentee"
                              onClick={() =>
                                void removeMentee(
                                  group
                                    .mentor
                                    .id,

                                  mentee.id,
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        ),
                      )}

                    </div>

                  </div>

                  <div className="assignment-row-actions">

                    <button
                      type="button"
                      className="assignment-edit-button"
                      onClick={() =>
                        openEdit(
                          group,
                        )
                      }
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="assignment-delete-button"
                      onClick={() =>
                        void removeMentorAssignments(
                          group
                            .mentor
                            .id,
                        )
                      }
                    >
                      Eliminar
                    </button>

                  </div>

                </article>
              ),
            )}

          </div>
        )}

      </section>

      {modalOpen && (
        <ModalAsignacion
          mentees={mentees}
          mentors={mentors}
          editing={editing}
          onClose={() =>
            setModalOpen(
              false,
            )
          }
          onSaved={async () => {
            setModalOpen(
              false,
            );

            await loadData();
          }}
        />
      )}

    </div>
  );
}