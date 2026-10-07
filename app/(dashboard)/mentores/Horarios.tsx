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

type AgendaSlot = BookingSlot & {
  available: boolean;
  reason?: "occupied" | "past";
};

const SLOT_DURATION_MINUTES = 30;
const BOOKING_MARGIN_MINUTES = 5;
const LIMA_TIME_ZONE = "America/Lima";

function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4.5"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <path
        d="M8 3.5V6.5M16 3.5V6.5M3 9H21"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      <path
        d="M7.5 13H7.51M12 13H12.01M16.5 13H16.51M7.5 17H7.51M12 17H12.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />

      <path
        d="M12 7.5V12L15 14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M15 18L9 12L15 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 18L15 12L9 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function parseGraphDateTime(value: string, timeZone?: string): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return new Date(value);
  }

  const localDateTime = value.replace(/\.\d+$/, "");
  const normalizedTimeZone = timeZone?.trim().toLowerCase();

  const isUtc =
    normalizedTimeZone === "utc" ||
    normalizedTimeZone === "(utc) coordinated universal time" ||
    normalizedTimeZone?.includes("coordinated universal time");

  if (isUtc) {
    return new Date(`${localDateTime}Z`);
  }

  const isPeruTimeZone =
    timeZone === "SA Pacific Standard Time" ||
    timeZone === "America/Lima" ||
    normalizedTimeZone?.includes("utc-05:00");

  if (isPeruTimeZone) {
    return new Date(`${localDateTime}-05:00`);
  }

  console.warn("Zona horaria no reconocida:", timeZone);

  return new Date(`${localDateTime}Z`);
}

function roundUpToNextSlot(timestamp: number) {
  const slotDurationMs = SLOT_DURATION_MINUTES * 60 * 1000;

  return Math.ceil(timestamp / slotDurationMs) * slotDurationMs;
}

function createSlots(
  availabilityItems: AvailabilityItem[],
  staffId: string,
  currentTimestamp: number,
): AgendaSlot[] {
  const relevantItems = availabilityItems.filter((item) => {
    const status = item.status.toLowerCase();

    return status === "available" || status === "busy";
  });

  if (relevantItems.length === 0) {
    return [];
  }

  const starts = relevantItems
    .map((item) =>
      parseGraphDateTime(
        item.startDateTime.dateTime,
        item.startDateTime.timeZone,
      ).getTime(),
    )
    .filter(Number.isFinite);

  const ends = relevantItems
    .map((item) =>
      parseGraphDateTime(
        item.endDateTime.dateTime,
        item.endDateTime.timeZone,
      ).getTime(),
    )
    .filter(Number.isFinite);

  if (starts.length === 0 || ends.length === 0) {
    return [];
  }

  const scheduleStart = Math.min(...starts);
  const scheduleEnd = Math.max(...ends);

  const durationMs = SLOT_DURATION_MINUTES * 60 * 1000;

  let current = roundUpToNextSlot(scheduleStart);

  const minimumBookableTime =
    currentTimestamp + BOOKING_MARGIN_MINUTES * 60 * 1000;

  const slots: AgendaSlot[] = [];

  for (; current + durationMs <= scheduleEnd; current += durationMs) {
    const slotStart = current;
    const slotEnd = current + durationMs;

    const overlappingItems = relevantItems.filter((item) => {
      const itemStart = parseGraphDateTime(
        item.startDateTime.dateTime,
        item.startDateTime.timeZone,
      ).getTime();

      const itemEnd = parseGraphDateTime(
        item.endDateTime.dateTime,
        item.endDateTime.timeZone,
      ).getTime();

      return itemStart < slotEnd && itemEnd > slotStart;
    });

    const isBusy = overlappingItems.some(
      (item) => item.status.toLowerCase() === "busy",
    );

    const isFullyAvailable = overlappingItems.some((item) => {
      if (item.status.toLowerCase() !== "available") {
        return false;
      }

      const itemStart = parseGraphDateTime(
        item.startDateTime.dateTime,
        item.startDateTime.timeZone,
      ).getTime();

      const itemEnd = parseGraphDateTime(
        item.endDateTime.dateTime,
        item.endDateTime.timeZone,
      ).getTime();

      return itemStart <= slotStart && itemEnd >= slotEnd;
    });

    const isTooCloseToNow = slotStart < minimumBookableTime;

    const available = !isBusy && isFullyAvailable && !isTooCloseToNow;

    const startDate = new Date(slotStart);
    const endDate = new Date(slotEnd);

    slots.push({
      id: `${staffId}-${slotStart}`,

      day: startDate.toLocaleDateString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: LIMA_TIME_ZONE,
      }),

      time: startDate.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: LIMA_TIME_ZONE,
      }),

      available,

      startAt: startDate.toISOString(),

      endAt: endDate.toISOString(),

      staffId,

      reason: isBusy ? "occupied" : isTooCloseToNow ? "past" : undefined,
    });
  }

  return slots;
}

function getDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getCalendarDateInfo(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return {
    year,
    month,
    day,

    fullDate: new Intl.DateTimeFormat("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date),
  };
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));

  const lastDay = new Date(Date.UTC(year, month, 0));

  const firstWeekday = (firstDay.getUTCDay() + 6) % 7;

  const days: string[] = [];

  for (let index = firstWeekday - 1; index >= 0; index--) {
    const date = new Date(Date.UTC(year, month - 1, -index));

    days.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
        2,
        "0",
      )}-${String(date.getUTCDate()).padStart(2, "0")}`,
    );
  }

  for (let day = 1; day <= lastDay.getUTCDate(); day++) {
    days.push(
      `${year}-${String(month).padStart(
        2,
        "0",
      )}-${String(day).padStart(2, "0")}`,
    );
  }

  while (days.length < 42) {
    const lastKey = days[days.length - 1];

    const [lastYear, lastMonth, lastDay] = lastKey.split("-").map(Number);

    const nextDate = new Date(Date.UTC(lastYear, lastMonth - 1, lastDay + 1));

    days.push(
      `${nextDate.getUTCFullYear()}-${String(
        nextDate.getUTCMonth() + 1,
      ).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`,
    );
  }

  return days;
}

function getTodayKey() {
  return getDateKey(new Date());
}

export default function Horarios({ mentor, onClose }: Props) {
  const [services, setServices] = useState<BookingService[]>([]);

  const [selectedServiceId, setSelectedServiceId] = useState("");

  const [availability, setAvailability] = useState<AvailabilityGroup[]>([]);

  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);

  const [selectedDay, setSelectedDay] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [availabilityMessage, setAvailabilityMessage] = useState("");

  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        setLoading(true);
        setError("");
        setSelectedDay("");
        setSelectedSlot(null);
        setAvailabilityMessage("");

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

  const slots = useMemo<AgendaSlot[]>(() => {
    return availability.flatMap((group) =>
      createSlots(
        group.availabilityItems ?? [],
        group.staffId ?? mentor.id,
        currentTimestamp,
      ),
    );
  }, [availability, mentor.id, currentTimestamp]);

  const slotsByDay = useMemo(() => {
    return slots.reduce<Record<string, AgendaSlot[]>>((result, slot) => {
      const dateKey = getDateKey(new Date(slot.startAt));

      if (!result[dateKey]) {
        result[dateKey] = [];
      }

      result[dateKey].push(slot);

      return result;
    }, {});
  }, [slots]);

  const availableDays = Object.keys(slotsByDay);

  const firstAvailableDate = slots[0] ? new Date(slots[0].startAt) : new Date();

  const [calendarMonth, setCalendarMonth] = useState(
    firstAvailableDate.getUTCMonth() + 1,
  );

  const [calendarYear, setCalendarYear] = useState(
    firstAvailableDate.getUTCFullYear(),
  );

  useEffect(() => {
    if (slots.length === 0) {
      return;
    }

    const firstDate = new Date(slots[0].startAt);

    setCalendarMonth(firstDate.getUTCMonth() + 1);

    setCalendarYear(firstDate.getUTCFullYear());
  }, [slots.length]);

  const calendarDays = useMemo(
    () => getCalendarDays(calendarYear, calendarMonth),
    [calendarYear, calendarMonth],
  );

  const calendarMonthName = new Intl.DateTimeFormat("es-PE", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(calendarYear, calendarMonth - 1, 1)));

  const calendarTitle = `${calendarMonthName} ${calendarYear}`;

  const todayKey = getTodayKey();

  const selectedDaySlots = selectedDay ? (slotsByDay[selectedDay] ?? []) : [];

  const selectedDateInfo = selectedDay
    ? getCalendarDateInfo(selectedDay)
    : null;

  return (
    <section
      className="agenda-inline"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        fontFamily: "inherit",
      }}
    >
      {/* =============================
          ENCABEZADO
      ============================== */}

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
              margin: "0 0 6px 0",
              lineHeight: 1.25,
              overflowWrap: "anywhere",
            }}
          >
            Agenda de {mentor.name}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Selecciona una fecha y un horario para tu mentoría.
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

      {error && <p className="form-error">{error}</p>}

      {availabilityMessage && (
        <div
          role="alert"
          style={{
            padding: "10px 13px",
            borderRadius: "8px",
            background: "#f7f7f7",
            border: "1px solid #dedede",
            fontSize: "12px",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {availabilityMessage}
        </div>
      )}

      {loading ? (
        <div className="empty-state compact-state">
          <h2>Consultando disponibilidad...</h2>

          <p>Estamos buscando los próximos horarios del mentor.</p>
        </div>
      ) : availableDays.length === 0 ? (
        <div className="empty-state compact-state">
          <h2>No hay horarios disponibles</h2>

          <p>Este mentor no tiene disponibilidad en los próximos 14 días.</p>
        </div>
      ) : (
        <div
          className="schedule-selector"
          style={{
            width: "100%",
            maxWidth: "720px",
            margin: "0 auto",
          }}
        >
          {/* =============================
              CONTENEDOR FECHA + HORA
          ============================== */}

          <div
            className="schedule-columns"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 1fr) minmax(250px, 290px)",
              gap: "24px",
              alignItems: "stretch",
            }}
          >
            {/* =============================
                BLOQUE FECHA
            ============================== */}

            <div
              style={{
                border: "1px solid #dedede",
                borderRadius: "12px",
                background: "#fff",
                padding: "15px",
              }}
            >
              {/* Encabezado Fecha */}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#f5f5f5",
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CalendarIcon size={17} />
                </div>

                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#777",
                      lineHeight: 1.2,
                    }}
                  >
                    Fecha
                  </span>

                  <span
                    style={{
                      display: "block",
                      marginTop: "2px",
                      fontSize: "11px",
                      color: "#999",
                    }}
                  >
                    Selecciona un día
                  </span>
                </div>
              </div>

              {/* Navegación del mes */}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "9px",
                }}
              >
                <strong
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {calendarTitle}
                </strong>

                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Mes anterior"
                    onClick={() => {
                      if (calendarMonth === 1) {
                        setCalendarMonth(12);
                        setCalendarYear((year) => year - 1);
                      } else {
                        setCalendarMonth((month) => month - 1);
                      }
                    }}
                    style={{
                      width: "28px",
                      height: "28px",
                      border: "1px solid #d7d7d7",
                      borderRadius: "7px",
                      background: "#fff",
                      color: "#555",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ChevronLeftIcon />
                  </button>

                  <button
                    type="button"
                    aria-label="Mes siguiente"
                    onClick={() => {
                      if (calendarMonth === 12) {
                        setCalendarMonth(1);
                        setCalendarYear((year) => year + 1);
                      } else {
                        setCalendarMonth((month) => month + 1);
                      }
                    }}
                    style={{
                      width: "28px",
                      height: "28px",
                      border: "1px solid #d7d7d7",
                      borderRadius: "7px",
                      background: "#fff",
                      color: "#555",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>

              {/* Días de la semana */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "2px",
                  marginBottom: "3px",
                }}
              >
                {["L", "M", "M", "J", "V", "S", "D"].map((weekday, index) => (
                  <div
                    key={`${weekday}-${index}`}
                    style={{
                      textAlign: "center",
                      fontSize: "9px",
                      fontWeight: 700,
                      padding: "2px",
                      color: "#888",
                    }}
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              {/* Calendario */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "2px",
                }}
              >
                {calendarDays.map((dateKey) => {
                  const info = getCalendarDateInfo(dateKey);

                  const isCurrentMonth =
                    info.month === calendarMonth && info.year === calendarYear;

                  const hasSchedule = availableDays.includes(dateKey);

                  const isPast = dateKey < todayKey;

                  const isSelected = selectedDay === dateKey;

                  const isDisabled = !isCurrentMonth || isPast || !hasSchedule;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) {
                          return;
                        }

                        setSelectedDay(dateKey);

                        setAvailabilityMessage("");
                      }}
                      style={{
                        height: "32px",
                        border: isSelected
                          ? "1px solid #222"
                          : "1px solid transparent",
                        borderRadius: "7px",
                        background: isSelected
                          ? "#222"
                          : hasSchedule && isCurrentMonth && !isPast
                            ? "#f6f6f6"
                            : "transparent",
                        color: isSelected
                          ? "#fff"
                          : isCurrentMonth && !isPast
                            ? "#222"
                            : "#c9c9c9",
                        cursor: isDisabled ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: hasSchedule ? 600 : 400,
                        opacity: isCurrentMonth ? 1 : 0.35,
                        transition: "background 120ms ease, color 120ms ease",
                      }}
                    >
                      {info.day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* =============================
                BLOQUE HORA
            ============================== */}

            <div
              style={{
                border: "1px solid #dedede",
                borderRadius: "12px",
                background: "#fff",
                padding: "15px",
                minHeight: "100%",
                animation: selectedDay
                  ? "schedulePanelIn 180ms ease-out"
                  : "none",
              }}
            >
              {/* Encabezado Hora */}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#f5f5f5",
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ClockIcon size={17} />
                </div>

                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#777",
                      lineHeight: 1.2,
                    }}
                  >
                    Hora
                  </span>

                  <span
                    style={{
                      display: "block",
                      marginTop: "2px",
                      fontSize: "11px",
                      color: "#999",
                    }}
                  >
                    Elige un horario
                  </span>
                </div>
              </div>

              {!selectedDay ? (
                <div
                  style={{
                    minHeight: "177px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: "12px",
                    color: "#999",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      lineHeight: 1.5,
                      maxWidth: "150px",
                    }}
                  >
                    Los horarios aparecerán aquí.
                  </span>
                </div>
              ) : (
                <>
                  {/* Fecha seleccionada */}

                  <div
                    style={{
                      padding: "8px 9px",
                      borderRadius: "8px",
                      background: "#f8f8f8",
                      marginBottom: "10px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontSize: "9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#888",
                        marginBottom: "3px",
                      }}
                    >
                      Fecha seleccionada
                    </span>

                    <strong
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        lineHeight: 1.35,
                      }}
                    >
                      {selectedDateInfo?.fullDate}
                    </strong>
                  </div>

                  {/* Horarios */}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "5px",
                      maxHeight: "210px",
                      overflowY: "auto",
                      paddingRight: "2px",
                    }}
                  >
                    {selectedDaySlots.map((slot) => {
                      const unavailable = !slot.available;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          className="time-slot"
                          aria-disabled={unavailable}
                          onClick={() => {
                            if (unavailable) {
                              setAvailabilityMessage(
                                "No hay disponibilidad en este horario. Elija otro horario.",
                              );

                              return;
                            }

                            setAvailabilityMessage("");

                            setSelectedSlot(slot);
                          }}
                          title={
                            unavailable
                              ? "No hay disponibilidad en este horario. Elija otro horario."
                              : "Seleccionar horario"
                          }
                          style={{
                            minHeight: "32px",
                            padding: "5px 3px",
                            borderRadius: "6px",
                            cursor: unavailable ? "not-allowed" : "pointer",
                            fontSize: "11px",
                            fontWeight: 600,
                            textAlign: "center",
                            opacity: unavailable ? 0.4 : 1,
                            textDecoration: unavailable
                              ? "line-through"
                              : "none",
                            background: unavailable ? "#f5f5f5" : undefined,
                            border: unavailable ? "1px solid #ddd" : undefined,
                          }}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <style jsx>{`
            @keyframes schedulePanelIn {
              from {
                opacity: 0;
                transform: translateX(5px);
              }

              to {
                opacity: 1;
                transform: translateX(0);
              }
            }

            @media (max-width: 650px) {
              .schedule-columns {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>
      )}

      {selectedSlot && selectedService && (
        <ModalReserva
          mentor={mentor}
          slot={selectedSlot}
          service={selectedService}
          onClose={() => setSelectedSlot(null)}
          onSuccess={() => {
            setSelectedSlot(null);
            setAvailabilityMessage("");
          }}
        />
      )}
    </section>
  );
}
