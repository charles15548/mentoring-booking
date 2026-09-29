"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  GraduationCap,
  RefreshCw,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type Metrics = {
  summary: { mentees: number; mentors: number; meetings: number };
  meetingsByHour: Array<{ hour: number; label: string; meetings: number }>;
};

export default function CoordinatorPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  async function loadMetrics() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión ha expirado. Vuelve a iniciar sesión.");
      }

      const response = await fetch("/api/coordinador/metricas", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron cargar las métricas.");
      }

      setMetrics(data);
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudieron cargar las métricas.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetrics();
  }, []);

  const maximum = useMemo(
    () =>
      Math.max(
        1,
        ...(metrics?.meetingsByHour.map((item) => item.meetings) ?? [0]),
      ),
    [metrics],
  );

  const summary = metrics
    ? [
        {
          label: "Mentees activos",
          value: metrics.summary.mentees,
          detail: "Participantes con acceso activo",
          Icon: GraduationCap,
          tone: "coral",
        },
        {
          label: "Mentores activos",
          value: metrics.summary.mentors,
          detail: "Mentores habilitados en el sistema",
          Icon: Users,
          tone: "blue",
        },
        {
          label: "Reuniones registradas",
          value: metrics.summary.meetings,
          detail: "Citas en Microsoft Bookings",
          Icon: CalendarDays,
          tone: "cream",
        },
      ]
    : [];

  return (
    <main className="page-content">
      <header className="welcome-row">
        <div>
          <p className="eyebrow">COORDINACIÓN · PROUNI</p>
          <h1>Panel de coordinación</h1>
          <p className="intro">
            Vista general de participantes y actividad de mentorías.
          </p>
        </div>
        <button
          type="button"
          className="outline-button"
          onClick={() => void loadMetrics()}
          disabled={loading}
        >
          <RefreshCw size={15} /> Actualizar
        </button>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <>
          {/* <section className="stats-grid" aria-label="Resumen de mentorías">
            {loading && !metrics
              ? Array.from({ length: 3 }, (_, index) => (
                  <div className="stat-card blue" key={index} />
                ))
              : summary.map(({ label, value, detail, Icon, tone }) => (
                  <article className={`stat-card ${tone}`} key={label}>
                    <Icon size={19} aria-hidden="true" />
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </article>
                ))}
          </section> */}
<section 
  className="stats-grid" 
  aria-label="Resumen de mentorías"
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem',
    width: '100%'
  }}
>
  {loading && !metrics
    ? Array.from({ length: 3 }, (_, index) => (
        <div 
          className="stat-card blue" 
          key={index} 
          style={{ 
            height: '110px',
            borderRadius: '12px',
            backgroundColor: '#f1f5f9',
            animation: 'pulse 1.5s infinite ease-in-out'
          }} 
        />
      ))
    : summary.map(({ label, value, detail, Icon, tone }) => (
        <article 
          className={`stat-card ${tone}`} 
          key={label} 
          style={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            padding: '1.25rem',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#37414e' }}>
            <Icon size={19} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
          </div>

          <strong style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
            {value}
          </strong>

          <small style={{ fontSize: '0.75rem', color: '#3b414b', marginTop: '0.1rem' }}>
            {detail}
          </small>
        </article>
      ))}
</section>

          <section className="calendar-card">
            <div className="section-heading">
              <div>
                <h2>Horario de las reuniones</h2>
                <p className="intro">
                  Distribución de citas registradas en Microsoft Bookings, hora Perú.
                </p>
              </div>
              <span className="status-pill">
                <Clock3 size={15} />
                {updatedAt
                  ? `Actualizado a las ${updatedAt.toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Cargando"}
              </span>
            </div>

            {loading && !metrics ? (
              <div className="empty-state compact-state">
                Cargando distribución de reuniones...
              </div>
            ) : (
              <div
                aria-label="Gráfica de reuniones por hora"
                style={{
                  alignItems: "end",
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "repeat(13, minmax(28px, 1fr))",
                  minHeight: 240,
                }}
              >
                {metrics?.meetingsByHour.map((item) => {
                  const height = item.meetings
                    ? Math.max(16, (item.meetings / maximum) * 170)
                    : 4;

                  return (
                    <div
                      key={item.hour}
                      style={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        height: 230,
                        justifyContent: "end",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {item.meetings || ""}
                      </span>
                      <div
                        aria-label={`${item.meetings} reuniones a las ${item.label}`}
                        title={`${item.label}: ${item.meetings} reuniones`}
                        style={{
                          background: item.meetings
                            ? "var(--wine)"
                            : "var(--line)",
                          borderRadius: "7px 7px 2px 2px",
                          height,
                          maxWidth: 48,
                          width: "100%",
                        }}
                      />
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
