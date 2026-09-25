"use client";

import {
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import type {
  AssignmentGroup,
  Person,
} from "./page";

import "./asignacion.css";

type ModalProps = {
  mentees: Person[];

  mentors: Person[];

  editing:
    | AssignmentGroup
    | null;

  onClose: () => void;

  onSaved:
    () => Promise<void>;
};

export default function ModalAsignacion({
  mentees,
  mentors,
  editing,
  onClose,
  onSaved,
}: ModalProps) {
  const [step, setStep] =
    useState(
      editing ? 1 : 1,
    );

  const [
    selectedMentors,
    setSelectedMentors,
  ] = useState<string[]>(
    editing
      ? [
          editing
            .mentor
            .id,
        ]
      : [],
  );

  const [
    selectedMentees,
    setSelectedMentees,
  ] = useState<string[]>(
    editing
      ? editing.mentees.map(
          (mentee) =>
            mentee.id,
        )
      : [],
  );

  const [
    searchMentee,
    setSearchMentee,
  ] = useState("");

  const [
    searchMentor,
    setSearchMentor,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

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

  const filteredMentees =
    useMemo(() => {
      const value =
        searchMentee
          .trim()
          .toLowerCase();

      if (!value) {
        return mentees;
      }

      return mentees.filter(
        (mentee) =>
          personName(
            mentee,
          )
            .toLowerCase()
            .includes(value) ||
          mentee.email
            .toLowerCase()
            .includes(value),
      );
    }, [
      mentees,
      searchMentee,
    ]);

  const filteredMentors =
    useMemo(() => {
      const value =
        searchMentor
          .trim()
          .toLowerCase();

      if (!value) {
        return mentors;
      }

      return mentors.filter(
        (mentor) =>
          personName(
            mentor,
          )
            .toLowerCase()
            .includes(value) ||
          mentor.email
            .toLowerCase()
            .includes(value),
      );
    }, [
      mentors,
      searchMentor,
    ]);

  function toggleMentee(
    id: string,
  ) {
    setSelectedMentees(
      (current) =>
        current.includes(id)
          ? current.filter(
              (item) =>
                item !== id,
            )
          : [
              ...current,
              id,
            ],
    );
  }

  function toggleMentor(
    id: string,
  ) {
    if (editing) {
      return;
    }

    setSelectedMentors(
      (current) =>
        current.includes(id)
          ? current.filter(
              (item) =>
                item !== id,
            )
          : [
              ...current,
              id,
            ],
    );
  }

  const selectedMenteeData =
    mentees.filter(
      (item) =>
        selectedMentees.includes(
          item.id,
        ),
    );

  const selectedMentorData =
    mentors.filter(
      (item) =>
        selectedMentors.includes(
          item.id,
        ),
    );

  async function save() {
    try {
      setSaving(true);
      setError("");

      const {
        data: { session },
      } =
        await supabase.auth
          .getSession();

      const token =
        session?.access_token;

      let response: Response;

      if (editing) {
        response =
          await fetch(
            "/api/coordinador/asignacion",
            {
              method: "PUT",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify({
                  mentorId:
                    editing
                      .mentor
                      .id,

                  menteeIds:
                    selectedMentees,
                }),
            },
          );
      } else {
        response =
          await fetch(
            "/api/coordinador/asignacion",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify({
                  mentorIds:
                    selectedMentors,

                  menteeIds:
                    selectedMentees,
                }),
            },
          );
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo guardar la asignación.",
        );
      }

      await onSaved();

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la asignación.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="assignment-modal-backdrop">

      <div className="assignment-modal">

        <div className="assignment-modal-header">

          <div>
            <p className="assignment-eyebrow">
              {editing
                ? "EDITAR ASIGNACIÓN"
                : "NUEVA ASIGNACIÓN"}
            </p>

            <h2>
              {editing
                ? "Modificar mentees asignados"
                : "Asignar mentees a mentores"}
            </h2>
          </div>

          <button
            type="button"
            className="assignment-modal-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="assignment-stepper">

          <div
            className={`assignment-step ${
              step >= 1
                ? "active"
                : ""
            }`}
          >
            <span>1</span>
            <p>Mentores</p>
          </div>

          <div
            className={`assignment-step-line ${
              step >= 2
                ? "active"
                : ""
            }`}
          />

          <div
            className={`assignment-step ${
              step >= 2
                ? "active"
                : ""
            }`}
          >
            <span>2</span>
            <p>Mentees</p>
          </div>

          <div
            className={`assignment-step-line ${
              step >= 3
                ? "active"
                : ""
            }`}
          />

          <div
            className={`assignment-step ${
              step >= 3
                ? "active"
                : ""
            }`}
          >
            <span>3</span>
            <p>Confirmar</p>
          </div>

        </div>

        {error && (
          <div className="assignment-modal-error">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="assignment-modal-body">

            <div className="assignment-modal-section-header">

              <div>
                <h3>
                  {editing
                    ? "Mentor seleccionado"
                    : "Selecciona los mentores"}
                </h3>

                <p>
                  {editing
                    ? "Este mentor permanecerá fijo durante la edición."
                    : "Puedes seleccionar uno o varios mentores."}
                </p>
              </div>

              <span className="assignment-selected-count">
                {
                  selectedMentors.length
                }{" "}
                seleccionados
              </span>

            </div>

            {!editing && (
              <input
                className="assignment-modal-search"
                placeholder="Buscar mentor..."
                value={
                  searchMentor
                }
                onChange={(e) =>
                  setSearchMentor(
                    e.target.value,
                  )
                }
              />
            )}

            <div className="assignment-selection-grid">

              {filteredMentors
                .filter(
                  (mentor) =>
                    !editing ||
                    mentor.id ===
                      editing
                        .mentor
                        .id,
                )
                .map(
                  (mentor) => {
                    const selected =
                      selectedMentors.includes(
                        mentor.id,
                      );

                    return (
                      <button
                        type="button"
                        key={
                          mentor.id
                        }
                        className={`assignment-selection-card ${
                          selected
                            ? "selected"
                            : ""
                        }`}
                        onClick={() =>
                          toggleMentor(
                            mentor.id,
                          )
                        }
                      >

                        <div className="assignment-selection-avatar">
                          {personName(
                            mentor,
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="assignment-selection-info">
                          <strong>
                            {personName(
                              mentor,
                            )}
                          </strong>

                          <span>
                            {
                              mentor.email
                            }
                          </span>
                        </div>

                        <div className="assignment-check">
                          {selected
                            ? "✓"
                            : ""}
                        </div>

                      </button>
                    );
                  },
                )}

            </div>

            <div className="assignment-modal-actions assignment-actions-right">

              <button
                type="button"
                className="assignment-primary-button"
                disabled={
                  selectedMentors.length ===
                  0
                }
                onClick={() =>
                  setStep(2)
                }
              >
                Continuar
              </button>

            </div>

          </div>
        )}

        {step === 2 && (
          <div className="assignment-modal-body">

            <div className="assignment-modal-section-header">

              <div>
                <h3>
                  Selecciona los mentees
                </h3>

                <p>
                  Selecciona los usuarios
                  que estarán asignados
                  al mentor.
                </p>
              </div>

              <span className="assignment-selected-count">
                {
                  selectedMentees.length
                }{" "}
                seleccionados
              </span>

            </div>

            <input
              className="assignment-modal-search"
              placeholder="Buscar mentee..."
              value={
                searchMentee
              }
              onChange={(e) =>
                setSearchMentee(
                  e.target.value,
                )
              }
            />

            <div className="assignment-selection-grid">

              {filteredMentees.map(
                (mentee) => {
                  const selected =
                    selectedMentees.includes(
                      mentee.id,
                    );

                  return (
                    <button
                      type="button"
                      key={
                        mentee.id
                      }
                      className={`assignment-selection-card ${
                        selected
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        toggleMentee(
                          mentee.id,
                        )
                      }
                    >

                      <div className="assignment-selection-avatar">
                        {personName(
                          mentee,
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="assignment-selection-info">
                        <strong>
                          {personName(
                            mentee,
                          )}
                        </strong>

                        <span>
                          {
                            mentee.email
                          }
                        </span>
                      </div>

                      <div className="assignment-check">
                        {selected
                          ? "✓"
                          : ""}
                      </div>

                    </button>
                  );
                },
              )}

            </div>

            <div className="assignment-modal-actions">

              <button
                type="button"
                className="assignment-secondary-button"
                onClick={() =>
                  setStep(1)
                }
              >
                Atrás
              </button>

              <button
                type="button"
                className="assignment-primary-button"
                disabled={
                  selectedMentees.length ===
                  0
                }
                onClick={() =>
                  setStep(3)
                }
              >
                Continuar
              </button>

            </div>

          </div>
        )}

        {step === 3 && (
          <div className="assignment-modal-body">

            <div className="assignment-modal-section-header">
              <div>
                <h3>
                  Confirmar asignación
                </h3>

                <p>
                  Revisa la información
                  antes de guardar.
                </p>
              </div>
            </div>

            <div className="assignment-modal-summary">

              <div className="assignment-summary-card">

                <div className="assignment-summary-title">
                  Mentores

                  <span>
                    {
                      selectedMentorData.length
                    }
                  </span>
                </div>

                {selectedMentorData.map(
                  (mentor) => (
                    <div
                      className="assignment-summary-person"
                      key={
                        mentor.id
                      }
                    >
                      <strong>
                        {personName(
                          mentor,
                        )}
                      </strong>

                      <span>
                        {
                          mentor.email
                        }
                      </span>
                    </div>
                  ),
                )}

              </div>

              <div className="assignment-summary-card">

                <div className="assignment-summary-title">
                  Mentees

                  <span>
                    {
                      selectedMenteeData.length
                    }
                  </span>
                </div>

                {selectedMenteeData.map(
                  (mentee) => (
                    <div
                      className="assignment-summary-person"
                      key={
                        mentee.id
                      }
                    >
                      <strong>
                        {personName(
                          mentee,
                        )}
                      </strong>

                      <span>
                        {
                          mentee.email
                        }
                      </span>
                    </div>
                  ),
                )}

              </div>

            </div>

            {!editing && (
              <div className="assignment-total-box">
                <span>
                  Se crearán
                </span>

                <strong>
                  {selectedMentors.length *
                    selectedMentees.length}{" "}
                  asignaciones
                </strong>
              </div>
            )}

            <div className="assignment-modal-actions">

              <button
                type="button"
                className="assignment-secondary-button"
                onClick={() =>
                  setStep(2)
                }
              >
                Atrás
              </button>

              <button
                type="button"
                className="assignment-primary-button"
                disabled={saving}
                onClick={() =>
                  void save()
                }
              >
                {saving
                  ? "Guardando..."
                  : editing
                    ? "Guardar cambios"
                    : "Confirmar asignación"}
              </button>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}