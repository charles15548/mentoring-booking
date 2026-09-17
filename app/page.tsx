"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingSlot } from "@/models/booking.model";
import { getCurrentProfile, signOut } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

type Mentor = { id: string; businessId: string; businessName: string; name: string; staffIds: string[]; staff: Array<{ id: string; name: string; email: string; role: string }> };
type BookingService = { id: string; name: string; duration?: string };
type AvailabilityItem = { status: string; startDateTime: { dateTime: string }; endDateTime: { dateTime: string } };
type AvailabilityGroup = { staffId?: string; availabilityItems?: AvailabilityItem[] };

function parseGraphDateTime(value: string) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);
  const [date, time = "00:00:00"] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = "0"] = time.split(":");
  return new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute), Number(second)));
}

function limaWallTimeToUtc(value: Date) {
  return new Date(value.getTime() + 5 * 60 * 60 * 1000).toISOString();
}

function durationInMinutes(duration: string | undefined) {
  const match = duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) return 30;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) || 30;
}

function toSlots(item: AvailabilityItem, index: number, duration: number, staffId?: string): BookingSlot[] {
  if (item.status.toLowerCase() !== "available") return [];
  const rangeStart = parseGraphDateTime(item.startDateTime.dateTime).getTime();
  const rangeEnd = parseGraphDateTime(item.endDateTime.dateTime).getTime();
  const slotDuration = duration * 60_000;
  const firstStart = Math.ceil(Math.max(rangeStart, Date.now()) / slotDuration) * slotDuration;
  const slots: BookingSlot[] = [];

  for (let startTime = firstStart; startTime + slotDuration <= rangeEnd; startTime += slotDuration) {
    const start = new Date(startTime);
    const end = new Date(startTime + slotDuration);
    slots.push({
      id: `live-${index}-${startTime}`,
      day: start.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }),
      time: start.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      available: true,
      startAt: limaWallTimeToUtc(start),
      endAt: limaWallTimeToUtc(end),
      staffId,
    });
  }
  return slots;
}

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [services, setServices] = useState<BookingService[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingState, setBookingState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const selectedMentor = mentors.find((mentor) => mentor.id === selectedMentorId);
  const groupedSlots = useMemo(() => {
    return slots.reduce<Record<string, BookingSlot[]>>((groups, slot) => {
      (groups[slot.day] ??= []).push(slot);
      return groups;
    }, {});
  }, [slots]);

  useEffect(() => {
    async function loadWorkspace() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: profile } = await getCurrentProfile(data.user.id);
      if (!profile) { await signOut(); router.replace("/login"); return; }
      if (profile.rol === "coordinador") { router.replace("/coordinador"); return; }
      if (profile.rol === "mentor") { router.replace("/mentor"); return; }
      setUserName([profile.nombres, profile.apellidos].filter(Boolean).join(" ") || profile.email);
      setUserEmail(profile.email);
      const response = await fetch("/api/mentors");
      if (!response.ok) setError("No se pudo conectar con Microsoft Bookings.");
      else {
        const mentorList = await response.json() as Mentor[];
        setMentors(mentorList);
        setSelectedMentorId(mentorList[0]?.id ?? "");
        setSelectedBusinessId(mentorList[0]?.businessId ?? "");
      }
      setLoading(false);
    }
    void loadWorkspace();
  }, [router]);

  useEffect(() => {
    async function loadAvailability() {
      const mentor = mentors.find((item) => item.id === selectedMentorId);
      if (!mentor) return;
      setLoadingSlots(true);
      setSlots([]);
      setSelectedBusinessId(mentor.businessId);
      const servicesResponse = await fetch(`/api/bookings/services?businessId=${encodeURIComponent(mentor.businessId)}`);
      const serviceList = servicesResponse.ok ? await servicesResponse.json() as BookingService[] : [];
      const service = serviceList.find((item) => item.id === selectedServiceId) ?? serviceList[0];
      setServices(serviceList);
      setSelectedServiceId((current) => serviceList.some((item) => item.id === current) ? current : service?.id ?? "");
      const start = new Date();
      const end = new Date(start.getTime() + 14 * 86400000);
      const response = await fetch("/api/bookings/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: mentor.businessId, staffIds: mentor.staffIds, startDateTime: start.toISOString(), endDateTime: end.toISOString() }) });
      if (!response.ok) setError("No se pudo obtener la disponibilidad de este mentor.");
      else {
        const data = await response.json() as { value?: AvailabilityGroup[]; staffAvailabilityItem?: AvailabilityGroup[] };
        const groups = data.value ?? data.staffAvailabilityItem ?? [];
        const uniqueSlots = new Map<string, BookingSlot>();
        groups.flatMap((group) => (group.availabilityItems ?? []).flatMap((item, index) => toSlots(item, index, durationInMinutes(service?.duration), group.staffId))).forEach((slot) => {
          uniqueSlots.set(`${slot.startAt}-${slot.endAt}`, slot);
        });
        setSlots([...uniqueSlots.values()]);
      }
      setLoadingSlots(false);
    }
    void loadAvailability();
  }, [mentors, selectedMentorId, selectedServiceId]);

  function chooseMentor(mentor: Mentor) {
    setSelectedMentorId(mentor.id);
    setSelectedBusinessId(mentor.businessId);
    setAgendaOpen(true);
    setError("");
  }

  async function confirmBooking() {
    if (!selectedSlot?.startAt || !selectedSlot.endAt || !selectedMentor || !selectedServiceId) return;
    setBookingState("sending");
    if (!selectedSlot.staffId) { setError("Este horario no tiene un mentor asignado en Microsoft Bookings."); setBookingState("error"); return; }
    const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: selectedBusinessId, staffId: selectedSlot.staffId, serviceId: selectedServiceId, startAt: selectedSlot.startAt, endAt: selectedSlot.endAt, customerName: userName, customerEmail: userEmail }) });
    if (!response.ok) { const details = await response.json().catch(() => null) as { error?: string } | null; setError(details?.error ?? "No se pudo crear la reserva en Microsoft Bookings."); setBookingState("error"); return; }
    setBookingState("success");
    setTimeout(() => { setSelectedSlot(null); setBookingState("idle"); setAgendaOpen(false); }, 1800);
  }

  if (loading) return <main className="state-page"><p className="eyebrow">PROUNI · MENTORÍAS</p><h1>Cargando tu espacio...</h1></main>;

  return <main className="app-shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-mark">P</div><div><strong>PROUNI</strong><span>Mentorías</span></div></div><div className="workspace-label">ESPACIO PERSONAL</div><nav className="main-nav" aria-label="Navegación principal"><button className="nav-item active"><span className="nav-dot" />Mentores</button><button className="nav-item"><span className="nav-dot" />Mis reservas</button></nav><div className="sidebar-bottom"><button className="nav-item" onClick={() => void signOut().then(() => router.replace("/login"))}><span className="nav-dot" />Cerrar sesión</button><div className="profile-chip"><div className="avatar">{userName.slice(0, 2).toUpperCase()}</div><div><strong>{userName}</strong><span>Mentee</span></div></div></div></aside><section className="content-area"><header className="topbar"><div className="breadcrumb"><span>Inicio</span><b>/</b><strong>Mentores disponibles</strong></div><span className="status-pill"><i /> Microsoft Bookings conectado</span></header><div className="page-content"><section className="welcome-row"><div><p className="eyebrow">DISPONIBILIDAD EN TIEMPO REAL</p><h1>Elige con quién avanzar.</h1><p className="intro">Selecciona un mentor y luego revisa sus horarios organizados por día.</p></div></section>{error && <div className="form-error" role="alert">{error}</div>}{mentors.length === 0 ? <section className="empty-state"><h2>No hay mentores configurados</h2><p>Agrega personal a las páginas de reservas de Microsoft Bookings para que aparezca aquí.</p></section> : <section className="mentor-picker" aria-label="Mentores de Microsoft Bookings">{mentors.map((mentor) => <button className="mentor-option" key={mentor.id} onClick={() => chooseMentor(mentor)}><span className="mentor-avatar">{mentor.name.slice(0, 2).toUpperCase()}</span><span><strong>{mentor.name}</strong><small>{mentor.businessName}</small></span><b>Ver agenda →</b></button>)}</section>}</div></section>{agendaOpen && selectedMentor && <div className="agenda-backdrop" role="presentation" onClick={() => setAgendaOpen(false)}><section className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="agenda-title" onClick={(event) => event.stopPropagation()}><header className="agenda-modal-header"><div><p className="eyebrow">AGENDA DE {selectedMentor.name.toUpperCase()}</p><h2 id="agenda-title">Elige un horario</h2><p>{selectedMentor.businessName} · Hora de Lima</p></div><button className="modal-close" onClick={() => setAgendaOpen(false)} aria-label="Cerrar">×</button></header><label className="service-select">Tipo de reunión<select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>{loadingSlots ? <div className="empty-state compact-state"><h2>Cargando horarios...</h2></div> : Object.keys(groupedSlots).length === 0 ? <div className="empty-state compact-state"><h2>No hay horarios disponibles</h2><p>Este mentor no tiene disponibilidad en los próximos 14 días.</p></div> : <div className="day-groups">{Object.entries(groupedSlots).map(([day, daySlots]) => <section className="day-group" key={day}><h3>{day}</h3><div className="day-slots">{daySlots.map((slot) => <button className="time-slot" key={slot.id} onClick={() => setSelectedSlot(slot)}>{slot.time}</button>)}</div></section>)}</div>}</section></div>}{selectedSlot && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedSlot(null)}><div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedSlot(null)} aria-label="Cerrar">×</button><p className="eyebrow">NUEVA RESERVA</p><h2 id="booking-title">Confirma tu sesión</h2><p className="modal-copy">{selectedMentor?.name} · {services.find((service) => service.id === selectedServiceId)?.name}</p><div className="booking-summary"><span>{selectedSlot.day}</span><strong>{selectedSlot.time}</strong><small>Microsoft Bookings · Lima</small></div>{bookingState === "error" && <p className="form-error">{error || "No se pudo crear la reserva."}</p>}<button className="primary-button" disabled={bookingState === "sending"} onClick={() => void confirmBooking()}>{bookingState === "sending" ? "Reservando..." : bookingState === "success" ? "Reserva confirmada ✓" : "Confirmar reserva"}</button></div></div>}</main>;
}
