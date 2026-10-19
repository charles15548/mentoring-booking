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
import ProUniLoader from "@/components/ui/ProUniLoader";
import styles from "./coordinator.module.css";

type Metrics = {
  summary: {
    mentees: number;
    mentors: number;
    meetings: number;
  };
  meetingsByHour: Array<{
    hour: number;
    label: string;
    meetings: number;
  }>;
};

export default function CoordinatorPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  /* =========================================================
     CONSULTAR MÉTRICAS
  ========================================================= */

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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la información.");
      }

      setMetrics(data as Metrics);
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo actualizar la información.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     CARGA INICIAL
  ========================================================= */

  useEffect(() => {
    void loadMetrics();
  }, []);

  /* =========================================================
     CÁLCULOS DEL GRÁFICO
  ========================================================= */

  const maximum = useMemo(
    () =>
      Math.max(
        1,
        ...(metrics?.meetingsByHour.map((item) => item.meetings) ?? [0]),
      ),
    [metrics],
  );

  /* =========================================================
     TARJETAS RESUMEN
  ========================================================= */

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
          detail: "Mentorías programadas",
          Icon: CalendarDays,
          tone: "cream",
        },
      ]
    : [];

  /* =========================================================
     ESTADO DE ACTUALIZACIÓN
  ========================================================= */

  const isInitialLoading = loading && !metrics;
  const isRefreshing = loading && metrics !== null;

  /* =========================================================
     INTERFAZ
  ========================================================= */

  return (
    <main className="page-content">
      {/* ============================================
          ENCABEZADO
      ============================================ */}

      <header className="welcome-row">
        <div>
          <h1>Panel de coordinación</h1>

          <p className="intro">
            Vista general de participantes y actividad de mentorías.
          </p>
        </div>

        {/* BOTÓN ACTUALIZAR */}

        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => void loadMetrics()}
          disabled={loading}
          aria-label={
            loading
              ? "Actualizando información"
              : "Actualizar información del panel"
          }
          aria-busy={loading}
        >
          <RefreshCw
            size={17}
            strokeWidth={2}
            className={
              isRefreshing ? styles.refreshIconActive : styles.refreshIcon
            }
            aria-hidden="true"
          />

          <span>
            {isRefreshing
              ? "Actualizando..."
              : isInitialLoading
                ? "Cargando..."
                : "Actualizar"}
          </span>
        </button>
      </header>

      {/* ============================================
          MENSAJES DE ERROR
      ============================================ */}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {/* ============================================
          CARGA INICIAL
      ============================================ */}

      {isInitialLoading ? (
        <ProUniLoader
          icon="chart"
          title="Consultando información general"
          description="Estamos obteniendo los datos del programa de mentorías."
        />
      ) : metrics ? (
        <>
          {/* ============================================
              TARJETAS DE MÉTRICAS
          ============================================ */}

          <section
            className="stats-grid"
            aria-label="Resumen de mentorías"
            aria-busy={isRefreshing}
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "1rem",
              width: "100%",
            }}
          >
            {summary.map(({ label, value, detail, Icon, tone }) => (
              <article
                className={`stat-card ${tone}`}
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  padding: "1.25rem",
                  borderRadius: "12px",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
                  cursor: "default",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "#37414e",
                  }}
                >
                  <Icon
                    size={19}
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  />

                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    {label}
                  </span>
                </div>

                <strong
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.2,
                  }}
                >
                  {value}
                </strong>

                <small
                  style={{
                    fontSize: "0.75rem",
                    color: "#3b414b",
                    marginTop: "0.1rem",
                  }}
                >
                  {detail}
                </small>
              </article>
            ))}
          </section>

          {/* ============================================
              GRÁFICO DE REUNIONES
          ============================================ */}

          <section className="calendar-card" aria-busy={isRefreshing}>
            <div className="section-heading">
              <div>
                <h2>Horario de las reuniones</h2>

                <p className="intro">
                  Distribución de reuniones programadas por hora, según la hora
                  de Perú.
                </p>
              </div>

              <span className="status-pill" role="status">
                <Clock3 size={15} aria-hidden="true" />

                {isRefreshing
                  ? "Actualizando información..."
                  : updatedAt
                    ? `Actualizado a las ${updatedAt.toLocaleTimeString(
                        "es-PE",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}`
                    : "Información disponible"}
              </span>
            </div>

            <div className={styles.chartScroll}>
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
                {metrics.meetingsByHour.map((item) => {
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
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
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

                      <span
                        style={{
                          color: "var(--muted)",
                          fontSize: 11,
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
