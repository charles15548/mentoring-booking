"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookingSlot } from "@/models/booking.model";
import { getCurrentProfile } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

/* Datos que vienen de Microsoft Bookings */
type Mentor = {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  staffIds: string[];
};

type BookingService = {
  id: string;
  name: string;
  duration?: string;
};

type AvailabilityItem = {
  status: string;
  startDateTime: { dateTime: string };
  endDateTime: { dateTime: string };
};

type AvailabilityGroup = {
  staffId?: string;
  availabilityItems?: AvailabilityItem[];
};

type CurrentUser = {
  name: string;
  email: string;
};

type AvailabilityResponse = {
  value?: AvailabilityGroup[];
  staffAvailabilityItem?: AvailabilityGroup[];
};

/* Funciones auxiliares para convertir la respuesta de Microsoft */
function parseGraphDateTime(value: string): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return new Date(value);
  }

  const [datePart, timePart = "00:00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = "0"] = timePart.split(":");

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
}

function convertLimaTimeToUtc(value: Date): string {
  return new Date(value.getTime() + 5 * 60 * 60 * 1000).toISOString();
}

function getDurationInMinutes(duration?: string): number {
  const match = duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);

  if (!match) return 30;

  return Number(match[1] || 0) * 60 + Number(match[2] || 0) || 30;
}

function createSlotsFromAvailability(
  availability: AvailabilityItem,
  availabilityIndex: number,
  durationInMinutes: number,
  staffId?: string,
): BookingSlot[] {
  if (availability.status.toLowerCase() !== "available") {
    return [];
  }

  const rangeStart = parseGraphDateTime(
    availability.startDateTime.dateTime,
  ).getTime();
  const rangeEnd = parseGraphDateTime(
    availability.endDateTime.dateTime,
  ).getTime();
  const slotDuration = durationInMinutes * 60_000;
  const slots: BookingSlot[] = [];

  const firstSlotStart =
    Math.ceil(Math.max(rangeStart, Date.now()) / slotDuration) * slotDuration;

  for (
    let startTime = firstSlotStart;
    startTime + slotDuration <= rangeEnd;
    startTime += slotDuration
  ) {
    const start = new Date(startTime);
    const end = new Date(startTime + slotDuration);

    slots.push({
      id: `slot-${availabilityIndex}-${startTime}`,
      day: start.toLocaleDateString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      time: start.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }),
      available: true,
      startAt: convertLimaTimeToUtc(start),
      endAt: convertLimaTimeToUtc(end),
      staffId,
    });
  }

  return slots;
}

export default function MentoresPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [services, setServices] = useState<BookingService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [availableSlots, setAvailableSlots] = useState<BookingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "",
    email: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const slotsByDay = useMemo(() => {
    return availableSlots.reduce<Record<string, BookingSlot[]>>(
      (groups, slot) => {
        if (!groups[slot.day]) groups[slot.day] = [];
        groups[slot.day].push(slot);
        return groups;
      },
      {},
    );
  }, [availableSlots]);

  /* Carga el usuario y la lista de mentores al entrar a la pantalla */
  useEffect(() => {
    async function loadMentorScreen() {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setIsLoading(false);
        return;
      }

      const { data: profile } = await getCurrentProfile(authData.user.id);

      if (profile) {
        setCurrentUser({
          name:
            [profile.nombres, profile.apellidos].filter(Boolean).join(" ") ||
            profile.email,
          email: profile.email,
        });
      }

      const response = await fetch("/api/mentors");
      const mentorList = response.ok
        ? ((await response.json()) as Mentor[])
        : [];

      setMentors(mentorList);
      setSelectedMentor(mentorList[0] ?? null);
      setIsLoading(false);
    }

    void loadMentorScreen();
  }, []);

  /* Cada vez que cambia el mentor, consulta sus servicios y horarios */
  useEffect(() => {
    if (!selectedMentor) return;

    const mentorToLoad = selectedMentor;

    async function loadMentorAvailability() {
      setIsLoadingAvailability(true);
      setAvailableSlots([]);
      setErrorMessage("");

      const servicesResponse = await fetch(
        `/api/bookings/services?businessId=${encodeURIComponent(
          mentorToLoad.businessId,
        )}`,
      );
      const mentorServices = servicesResponse.ok
        ? ((await servicesResponse.json()) as BookingService[])
        : [];

      setServices(mentorServices);

      const selectedService =
        mentorServices.find((service) => service.id === selectedServiceId) ??
        mentorServices[0];

      if (selectedService?.id !== selectedServiceId) {
        setSelectedServiceId(selectedService?.id ?? "");
      }

      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 14 * 86_400_000);
      const availabilityResponse = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: mentorToLoad.businessId,
          staffIds: mentorToLoad.staffIds,
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
        }),
      });

      if (!availabilityResponse.ok) {
        setErrorMessage("No se pudo obtener la disponibilidad del mentor.");
        setIsLoadingAvailability(false);
        return;
      }

      const availabilityData =
        (await availabilityResponse.json()) as AvailabilityResponse;
      const groups =
        availabilityData.value ?? availabilityData.staffAvailabilityItem ?? [];
      const uniqueSlots = new Map<string, BookingSlot>();

      groups.forEach((group) => {
        (group.availabilityItems ?? [])
          .flatMap((item, index) =>
            createSlotsFromAvailability(
              item,
              index,
              getDurationInMinutes(selectedService?.duration),
              group.staffId,
            ),
          )
          .forEach((slot) => {
            uniqueSlots.set(`${slot.startAt}-${slot.endAt}`, slot);
          });
      });

      setAvailableSlots([...uniqueSlots.values()]);
      setIsLoadingAvailability(false);
    }

    void loadMentorAvailability();
  }, [selectedMentor, selectedServiceId]);

  function chooseMentor(mentor: Mentor) {
    setSelectedMentor(mentor);
    setSelectedSlot(null);
    setErrorMessage("");
  }

  async function confirmBooking() {
    if (!selectedMentor || !selectedSlot?.staffId || !selectedServiceId) {
      return;
    }

    setIsBooking(true);
    setErrorMessage("");

    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: selectedMentor.businessId,
        staffId: selectedSlot.staffId,
        serviceId: selectedServiceId,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        customerName: currentUser.name,
        customerEmail: currentUser.email,
      }),
    });

    setIsBooking(false);

    if (!response.ok) {
      setErrorMessage("No se pudo crear la reserva. Intenta nuevamente.");
      return;
    }

    setSelectedSlot(null);
    window.alert("Reserva confirmada correctamente.");
  }

  if (isLoading) {
    return (
      <main className="state-page">
        <p className="eyebrow">PROUNI · MENTORÍAS</p>
        <h1>Cargando tu espacio...</h1>
      </main>
    );
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">DISPONIBILIDAD EN TIEMPO REAL</p>
          <h1>Elige con quién avanzar.</h1>
          <p className="intro">
            Selecciona un mentor y revisa sus horarios disponibles.
          </p>
        </div>
      </section>

      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}

      {mentors.length === 0 ? (
        <section className="empty-state">
          <h2>No hay mentores configurados</h2>
          <p>Agrega personal a Microsoft Bookings para que aparezca aquí.</p>
        </section>
      ) : (
        <section className="mentor-picker" aria-label="Mentores disponibles">
          {mentors.map((mentor) => (
            <button
              className={`mentor-option flex items-center justify-between w-full gap-3 ${
                selectedMentor?.id === mentor.id ? "selected" : ""
              }`}
              key={mentor.id}
              onClick={() => chooseMentor(mentor)}
            >
              <span className="flex flex-col min-w-0 text-left break-words">
                <strong className="whitespace-normal">{mentor.name}</strong>
                <small className="whitespace-normal">
                  {mentor.businessName}
                </small>
              </span>
              <b className="whitespace-nowrap shrink-0">Ver agenda →</b>
            </button>
          ))}
        </section>
      )}

      {selectedMentor && (
        <section className="agenda-inline">
          <h2>Agenda de {selectedMentor.name}</h2>

          <label className="service-select">
            Tipo de reunión
            <select
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          {isLoadingAvailability ? (
            <div className="empty-state compact-state">
              <h2>Cargando horarios...</h2>
            </div>
          ) : Object.keys(slotsByDay).length === 0 ? (
            <div className="empty-state compact-state">
              <h2>No hay horarios disponibles</h2>
              <p>Este mentor no tiene horarios en los próximos 14 días.</p>
            </div>
          ) : (
            <div className="day-groups">
              {Object.entries(slotsByDay).map(([day, daySlots]) => (
                <section className="day-group" key={day}>
                  <h3>{day}</h3>
                  <div className="day-slots">
                    {daySlots.map((slot) => (
                      <button
                        className="time-slot"
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {selectedSlot && (
        <div className="modal-backdrop" role="presentation">
          <div className="booking-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setSelectedSlot(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="eyebrow">NUEVA RESERVA</p>
            <h2>Confirma tu sesión</h2>
            <div className="booking-summary">
              <span>{selectedSlot.day}</span>
              <strong>{selectedSlot.time}</strong>
              <small>Microsoft Bookings · Lima</small>
            </div>
            <button
              className="primary-button"
              disabled={isBooking}
              onClick={() => void confirmBooking()}
            >
              {isBooking ? "Reservando..." : "Confirmar reserva"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
