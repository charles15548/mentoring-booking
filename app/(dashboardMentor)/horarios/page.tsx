"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./horarios.module.css";

type TimeSlot = {
  startTime: string;
  endTime: string;
};

type WorkingDay = {
  day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

  timeSlots: TimeSlot[];
};

type ScheduleResponse = {
  id: string;
  name: string;
  timeZone: string;
  useBusinessHours: boolean;
  availabilityIsAffectedByPersonalCalendar: boolean;
  workingHours: WorkingDay[];
};

const days = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

function emptyWeek(): WorkingDay[] {
  return days.map((day) => ({
    day: day.key,
    timeSlots: [],
  }));
}

export default function HorariosPage() {
  const [mentorName, setMentorName] = useState("");
  const [workingHours, setWorkingHours] =
    useState<WorkingDay[]>(emptyWeek());

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No existe una sesión activa.");
    }

    return session.access_token;
  }

  async function cargarHorarios() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const token = await getToken();

      const response = await fetch("/api/mentors/horarios", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudieron obtener los horarios.",
        );
      }

      const schedule = data as ScheduleResponse;

      setMentorName(schedule.name);

      const normalizedWeek = days.map((day) => {
        const existingDay = schedule.workingHours?.find(
          (item) => item.day === day.key,
        );

        return {
          day: day.key,
          timeSlots: existingDay?.timeSlots ?? [],
        };
      });

      setWorkingHours(normalizedWeek);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los horarios.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void cargarHorarios();
  }, []);

  function toggleDay(day: WorkingDay["day"]) {
    setWorkingHours((current) =>
      current.map((item) => {
        if (item.day !== day) return item;

        if (item.timeSlots.length > 0) {
          return {
            ...item,
            timeSlots: [],
          };
        }

        return {
          ...item,
          timeSlots: [
            {
              startTime: "09:00:00.0000000",
              endTime: "17:00:00.0000000",
            },
          ],
        };
      }),
    );
  }

  function agregarHorario(day: WorkingDay["day"]) {
    setWorkingHours((current) =>
      current.map((item) =>
        item.day === day
          ? {
              ...item,
              timeSlots: [
                ...item.timeSlots,
                {
                  startTime: "09:00:00.0000000",
                  endTime: "17:00:00.0000000",
                },
              ],
            }
          : item,
      ),
    );
  }

  function eliminarHorario(
    day: WorkingDay["day"],
    index: number,
  ) {
    setWorkingHours((current) =>
      current.map((item) =>
        item.day === day
          ? {
              ...item,
              timeSlots: item.timeSlots.filter(
                (_, slotIndex) => slotIndex !== index,
              ),
            }
          : item,
      ),
    );
  }

  function cambiarHora(
    day: WorkingDay["day"],
    index: number,
    field: "startTime" | "endTime",
    value: string,
  ) {
    const graphTime = `${value}:00.0000000`;

    setWorkingHours((current) =>
      current.map((item) => {
        if (item.day !== day) return item;

        return {
          ...item,
          timeSlots: item.timeSlots.map((slot, slotIndex) =>
            slotIndex === index
              ? {
                  ...slot,
                  [field]: graphTime,
                }
              : slot,
          ),
        };
      }),
    );
  }

  function toInputTime(value: string) {
    if (!value) return "09:00";

    return value.substring(0, 5);
  }

  async function guardarHorarios() {
    try {
      setIsSaving(true);
      setErrorMessage("");

      for (const day of workingHours) {
        for (const slot of day.timeSlots) {
          if (slot.startTime >= slot.endTime) {
            throw new Error(
              "La hora de inicio debe ser menor que la hora de fin.",
            );
          }
        }
      }

      const token = await getToken();

      const response = await fetch("/api/mentors/horarios", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workingHours,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudieron guardar los horarios.",
        );
      }

      window.alert("Horarios actualizados correctamente.");

      await cargarHorarios();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los horarios.";

      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-content">
        <section className="empty-state">
          <h2>Cargando tus horarios...</h2>
        </section>
      </div>
    );
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">MENTOR · PROUNI</p>

          <h1>Mis horarios</h1>

          <p className="intro">
            Define los horarios semanales en los que deseas
            recibir mentorías.
          </p>

          {mentorName && (
            <p className="intro">
              Microsoft Bookings:{" "}
              <strong>{mentorName}</strong>
            </p>
          )}
        </div>
      </section>

      {errorMessage && (
        <p className="form-error">
          {errorMessage}
        </p>
      )}

      <section className={styles.scheduleCard}>
        {days.map((dayData) => {
          const day = workingHours.find(
            (item) => item.day === dayData.key,
          );

          if (!day) return null;

          const enabled = day.timeSlots.length > 0;

          return (
            <div
              className={styles.scheduleDay}
              key={dayData.key}
            >
              <div className={styles.scheduleDayHeader}>
                <div>
                  <strong>{dayData.label}</strong>

                  <span>
                    {enabled
                      ? "Disponible"
                      : "No disponible"}
                  </span>
                </div>

                <label className={styles.scheduleSwitch}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() =>
                      toggleDay(dayData.key)
                    }
                  />

                  <span />
                </label>
              </div>

              {enabled && (
                <div className={styles.scheduleSlots}>
                  {day.timeSlots.map((slot, index) => (
                    <div
                      className={styles.scheduleSlot}
                      key={`${day.day}-${index}`}
                    >
                      <div>
                        <label>Desde</label>

                        <input
                          type="time"
                          value={toInputTime(
                            slot.startTime,
                          )}
                          onChange={(event) =>
                            cambiarHora(
                              day.day,
                              index,
                              "startTime",
                              event.target.value,
                            )
                          }
                        />
                      </div>

                      <span
                        className={styles.scheduleSeparator}
                      >
                        —
                      </span>

                      <div>
                        <label>Hasta</label>

                        <input
                          type="time"
                          value={toInputTime(
                            slot.endTime,
                          )}
                          onChange={(event) =>
                            cambiarHora(
                              day.day,
                              index,
                              "endTime",
                              event.target.value,
                            )
                          }
                        />
                      </div>

                      <button
                        type="button"
                        className={styles.scheduleDelete}
                        title="Eliminar tramo"
                        onClick={() =>
                          eliminarHorario(
                            day.day,
                            index,
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className={styles.scheduleAdd}
                    onClick={() =>
                      agregarHorario(day.day)
                    }
                  >
                    + Agregar otro horario
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className={styles.scheduleActions}>
        <button
          className="primary-button"
          disabled={isSaving}
          onClick={() =>
            void guardarHorarios()
          }
        >
          {isSaving
            ? "Guardando..."
            : "Guardar horarios"}
        </button>
      </div>
    </div>
  );
}