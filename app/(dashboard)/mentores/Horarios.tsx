"use client";

import { useEffect, useMemo, useState } from "react";

import type { BookingSlot } from "@/models/booking.model";

import ModalReserva from "./ModalReserva";

type Mentor = {
  id: string;
  name: string;
  email: string;
};

type BookingService = {
  id: string;
  name: string;
  duration: string;
};

type AvailabilityItem = {
  status: string;

  startDateTime: {
    dateTime: string;
    timeZone?: string;
  };

  endDateTime: {
    dateTime: string;
    timeZone?: string;
  };
};

type AvailabilityGroup = {
  staffId?: string;
  availabilityItems?: AvailabilityItem[];
};

type ScheduleResponse = {
  staffId: string;
  services: BookingService[];
  availability: AvailabilityGroup[];
};

type Props = {
  mentor: Mentor;
  onClose: () => void;
};

function parseGraphDateTime(value: string, timeZone?: string) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return new Date(value);
  }
  const localDateTime = value.replace(/\.\d+$/, "");

  const isPeruTimeZone =
    timeZone === "SA Pacific Standard Time" ||
    timeZone === "America/Lima" ||
    timeZone?.includes("UTC-05:00");

  if (isPeruTimeZone) {
    return new Date(`${localDateTime}-05:00`);
  }
  if (timeZone === "UTC") {
    return new Date(`${localDateTime}Z`);
  }

  console.warn("Zona horaria no reconocida", timeZone);

  return new Date(`${localDateTime}Z`);
}

function durationMinutes(duration?: string) {
  const match = duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);

  if (!match) return 30;

  return Number(match[1] || 0) * 60 + Number(match[2] || 0) || 30;
}

function createSlots(
  availability: AvailabilityItem,
  duration: number,
  staffId: string,
): BookingSlot[] {
  if (availability.status.toLowerCase() !== "available") {
    return [];
  }

  const start = parseGraphDateTime(
    availability.startDateTime.dateTime,
    availability.startDateTime.timeZone,
  ).getTime();

  const end = parseGraphDateTime(
    availability.endDateTime.dateTime,
    availability.endDateTime.timeZone,
  ).getTime();

  const durationMs = duration * 60 * 1000;

  const slots: BookingSlot[] = [];

  for (
    let current = start;
    current + durationMs <= end;
    current += durationMs
  ) {
    const startDate = new Date(current);

    const endDate = new Date(current + durationMs);

    if (startDate.getTime() < Date.now()) {
      continue;
    }

    slots.push({
      id: `${staffId}-${current}`,

      day: startDate.toLocaleDateString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "America/Lima",
      }),

      time: startDate.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Lima",
      }),

      available: true,

      startAt: startDate.toISOString(),

      endAt: endDate.toISOString(),

      staffId,
    });
  }

  return slots;
}

function getDateInfo(slot: BookingSlot) {
  const date = new Date(slot.startAt);

  return {
    weekday: date.toLocaleDateString("es-PE", {
      weekday: "short",
      timeZone: "America/Lima",
    }),

    day: date.toLocaleDateString("es-PE", {
      day: "2-digit",
      timeZone: "America/Lima",
    }),

    month: date.toLocaleDateString("es-PE", {
      month: "short",
      timeZone: "America/Lima",
    }),
  };
}

export default function Horarios({ mentor, onClose }: Props) {
  const [services, setServices] = useState<BookingService[]>([]);

  const [selectedServiceId, setSelectedServiceId] = useState("");

  const [availability, setAvailability] = useState<AvailabilityGroup[]>([]);

  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);

  const [selectedDay, setSelectedDay] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        setLoading(true);
        setError("");
        setSelectedDay("");
        setSelectedSlot(null);

        const response = await fetch(
          `/api/mentors/${encodeURIComponent(mentor.id)}/horarios`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudieron obtener los horarios.");
        }

        const result = data as ScheduleResponse;

        setServices(result.services);

        setAvailability(result.availability);

        setSelectedServiceId(result.services[0]?.id ?? "");
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los horarios.",
        );
      } finally {
        setLoading(false);
      }
    }

    void cargar();
  }, [mentor.id]);

  const selectedService = services.find(
    (service) => service.id === selectedServiceId,
  );

  const slots = useMemo(() => {
    if (!selectedService) {
      return [];
    }

    const duration = durationMinutes(selectedService.duration);

    return availability.flatMap((group) =>
      (group.availabilityItems ?? []).flatMap((item) =>
        createSlots(item, duration, group.staffId ?? mentor.id),
      ),
    );
  }, [availability, selectedService, mentor.id]);

  const slotsByDay = useMemo(() => {
    return slots.reduce<Record<string, BookingSlot[]>>((result, slot) => {
      if (!result[slot.day]) {
        result[slot.day] = [];
      }

      result[slot.day].push(slot);

      return result;
    }, {});
  }, [slots]);

  const availableDays = Object.keys(slotsByDay);

  const selectedDaySlots = selectedDay ? (slotsByDay[selectedDay] ?? []) : [];

  return (
    <section
      className="agenda-inline"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "22px",
        fontFamily: "inherit",
      }}
    >
      {/* ========================= */}
      {/* CABECERA */}
      {/* ========================= */}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: 1,
          }}
        >
          <p
            className="eyebrow"
            style={{
              marginBottom: "5px",
            }}
          >
            MENTORÍA
          </p>

          <h2
            style={{
              margin: "0 0 7px 0",
              lineHeight: 1.25,
              overflowWrap: "anywhere",
            }}
          >
            Agenda de {mentor.name}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            Encuentra un momento disponible para tu mentoría.
          </p>
        </div>

        <button
          className="outline-button"
          type="button"
          onClick={onClose}
          style={{
            flexShrink: 0,
          }}
        >
          Cambiar mentor
        </button>
      </div>

      {/* ========================= */}
      {/* ERROR */}
      {/* ========================= */}

      {error && <p className="form-error">{error}</p>}

      {/* ========================= */}
      {/* CARGANDO */}
      {/* ========================= */}

      {loading ? (
        <div className="empty-state compact-state">
          <h2>Consultando disponibilidad...</h2>

          <p>Estamos buscando los próximos horarios del mentor.</p>
        </div>
      ) : availableDays.length === 0 ? (
        /* ========================= */
        /* SIN DISPONIBILIDAD */
        /* ========================= */

        <div className="empty-state compact-state">
          <h2>No hay horarios disponibles</h2>

          <p>Este mentor no tiene disponibilidad en los próximos 14 días.</p>
        </div>
      ) : !selectedDay ? (
        /* ========================= */
        /* PASO 1: DÍA */
        /* ========================= */

        <div
          style={{
            border: "1px solid #ececec",
            borderRadius: "24px",
            background: "#fff",
            overflow: "hidden",
            boxShadow: "0 10px 35px rgba(0,0,0,0.04)",
          }}
        >
          {/* CABECERA TARJETA */}

          <div
            style={{
              padding: "24px 24px 18px",
              borderBottom: "1px solid #dedede",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                }}
              >
                Selecciona la fecha
              </span>
            </div>

            <h3
              style={{
                margin: "0 0 6px",
                fontSize: "21px",
                lineHeight: 1.3,
              }}
            >
              ¿Qué día te viene mejor?
            </h3>

            <p
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              Elige uno de los días disponibles.
            </p>
          </div>

          {/* FECHAS */}

          <div
            style={{
              padding: "22px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))",
                gap: "12px",
              }}
            >
              {availableDays.map((day) => {
                const daySlots = slotsByDay[day];

                const firstSlot = daySlots[0];

                const info = getDateInfo(firstSlot);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    style={{
                      border: "1px solid #b9b9b9",
                      borderRadius: "18px",
                      background: "#fff",
                      padding: "17px 12px",
                      minHeight: "135px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      gap: "3px",
                      transition:
                        "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      {info.weekday}
                    </span>

                    <strong
                      style={{
                        display: "block",
                        fontSize: "30px",
                        lineHeight: 1,
                        margin: "5px 0",
                      }}
                    >
                      {info.day}
                    </strong>

                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {info.month}
                    </span>

                    <span
                      style={{
                        marginTop: "9px",
                        padding: "5px 8px",
                        borderRadius: "999px",
                        background: "#f5f5f5",
                        fontSize: "11px",
                      }}
                    >
                      {daySlots.length}{" "}
                      {daySlots.length === 1 ? "hora" : "horas"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ========================= */
        /* PASO 2: HORA */
        /* ========================= */

        <div
          style={{
            border: "1px solid #ececec",
            borderRadius: "24px",
            background: "#fff",
            overflow: "hidden",
            boxShadow: "0 10px 35px rgba(0,0,0,0.04)",
          }}
        >
          {/* CABECERA */}

          <div
            style={{
              padding: "22px 24px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedDay("")}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                marginBottom: "18px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "13px",
                fontWeight: 600,
                opacity: 0.7,
              }}
            >
              <span
                style={{
                  fontSize: "18px",
                  lineHeight: 1,
                }}
              >
                ←
              </span>
              Volver a elegir día
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                }}
              >
                Selecciona la hora
              </span>
            </div>

            <h3
              style={{
                margin: "0 0 7px",
                fontSize: "21px",
              }}
            >
              ¿A qué hora puedes?
            </h3>

            <p
              style={{
                margin: 0,
                fontSize: "14px",

                lineHeight: 1.5,
              }}
            >
              Estos son los horarios disponibles para el día que elegiste.
            </p>
          </div>

          {/* DÍA SELECCIONADO */}

          <div
            style={{
              padding: "18px 24px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "15px",
                padding: "15px 17px",
                borderRadius: "16px",
                background: "#f6f6f6",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: "3px",
                  }}
                >
                  Fecha seleccionada
                </span>

                <strong
                  style={{
                    fontSize: "15px",
                    textTransform: "capitalize",
                  }}
                >
                  {selectedDay}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDay("")}
                style={{
                  border: "none",
                  background: "#fff",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                Cambiar
              </button>
            </div>
          </div>

          {/* HORAS */}

          <div
            style={{
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: "11px",
              }}
            >
              {selectedDaySlots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className="time-slot"
                  onClick={() => setSelectedSlot(slot)}
                  style={{
                    minHeight: "54px",
                    padding: "12px",
                    borderRadius: "14px",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: 700,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.time}
                </button>
              ))}
            </div>

            <p
              style={{
                margin: "20px 0 0",
                textAlign: "center",
                fontSize: "12px",
              }}
            >
              Hora local de Lima, Perú
            </p>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* MODAL RESERVA */}
      {/* ========================= */}

      {selectedSlot && selectedService && (
        <ModalReserva
          mentor={mentor}
          slot={selectedSlot}
          service={selectedService}
          onClose={() => setSelectedSlot(null)}
          onSuccess={() => {
            setSelectedSlot(null);
          }}
        />
      )}
    </section>
  );
}
