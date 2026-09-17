"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Reservation = { id: string; serviceName?: string; customerName?: string; startDateTime?: { dateTime: string }; status?: string };

export default function ReservasPage() {
  const [items, setItems] = useState<Reservation[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { void (async () => { const { data } = await supabase.auth.getUser(); if (!data.user?.email) { setError("No se encontró la sesión activa."); setLoading(false); return; } const response = await fetch(`/api/bookings?email=${encodeURIComponent(data.user.email)}`); if (!response.ok) setError("No se pudieron cargar tus reservas."); else setItems(await response.json() as Reservation[]); setLoading(false); })(); }, []);
  return <div className="page-content"><section className="welcome-row"><div><p className="eyebrow">HISTORIAL PERSONAL</p><h1>Mis reservas</h1><p className="intro">Consulta las sesiones que has agendado con tus mentores.</p></div></section>{loading ? <div className="empty-state"><h2>Cargando reservas...</h2></div> : error ? <p className="form-error">{error}</p> : items.length === 0 ? <div className="empty-state"><h2>Aún no tienes reservas</h2><p>Cuando confirmes una sesión aparecerá aquí.</p></div> : <section className="reservation-list">{items.map((item) => <article className="reservation-card" key={item.id}><div><p className="eyebrow">{item.status || "confirmada"}</p><h2>{item.serviceName || "Sesión de mentoría"}</h2><p>{item.customerName || "Reserva PROUNI"}</p></div><time>{item.startDateTime ? new Date(item.startDateTime.dateTime).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "Fecha por confirmar"}</time></article>)}</section>}</div>;
}
