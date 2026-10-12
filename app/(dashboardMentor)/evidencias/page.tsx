"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./evidencias.module.css";

/* =====================================================
   TIPOS
===================================================== */

type Mentorship = {
  id: string;
  serviceName?: string;
  menteeName?: string;
  menteeEmail?: string;
  startDateTime?: {
    dateTime: string;
  };
};

type Evidence = {
  id: string;
  acuerdo_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  created_at: string;
  url?: string;
};

type EvidenceMentorship = {
  mentorship: Mentorship;
  evidencias: Evidence[];
};

type RepositoryResponse = {
  items: EvidenceMentorship[];
  hasMore: boolean;
  nextOffset: number | null;
};

/* =====================================================
   CONFIGURACIÓN
===================================================== */

const PAGE_SIZE = 20;

/* =====================================================
   FUNCIONES AUXILIARES
===================================================== */

function formatDate(value?: string) {
  if (!value) {
    return "Fecha por confirmar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

function getLatestEvidence(evidencias: Evidence[]) {
  return evidencias.reduce((latest, current) =>
    new Date(current.created_at).getTime() >
    new Date(latest.created_at).getTime()
      ? current
      : latest,
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

/* =====================================================
   PÁGINA PRINCIPAL
===================================================== */

export default function EvidenciasPage() {
  const [items, setItems] = useState<EvidenceMentorship[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [error, setError] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  const loadingMoreRef = useRef(false);
  const mountedRef = useRef(false);
  const requestsRef = useRef<Set<AbortController>>(new Set());

  /* =====================================================
     CARGAR REPOSITORIO PAGINADO
  ===================================================== */

  const loadEvidenceMentorships = useCallback(
    async (offset: number, append: boolean, signal?: AbortSignal) => {
      if (append) {
        if (loadingMoreRef.current) return;

        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError("");
      }

      const inicio = performance.now();

      try {
        /* ============================================
           1. OBTENER SESIÓN ACTIVA
        ============================================ */

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (signal?.aborted || !mountedRef.current) {
          return;
        }

        if (sessionError || !session?.access_token) {
          throw new Error("No se encontró la sesión activa.");
        }

        /* ============================================
           2. CONSULTAR API PAGINADA
        ============================================ */

        const response = await fetch(
          `/api/mentors/evidencias/repositorio?limit=${PAGE_SIZE}&offset=${offset}`,
          {
            method: "GET",
            cache: "no-store",
            signal,
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        const data: unknown = await response.json();

        if (signal?.aborted || !mountedRef.current) {
          return;
        }

        if (!response.ok) {
          const message =
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : "No se pudieron cargar las evidencias.";

          throw new Error(message);
        }

        /* ============================================
           3. VALIDAR FORMATO DE RESPUESTA
        ============================================ */

        if (
          !data ||
          typeof data !== "object" ||
          !("items" in data) ||
          !Array.isArray(data.items) ||
          !("hasMore" in data) ||
          typeof data.hasMore !== "boolean" ||
          !("nextOffset" in data)
        ) {
          throw new Error(
            "El servidor devolvió un formato de respuesta inesperado.",
          );
        }

        const repository = data as RepositoryResponse;

        const newItems = repository.items.filter(
          (item) =>
            item.mentorship?.id &&
            Array.isArray(item.evidencias) &&
            item.evidencias.length > 0,
        );

        /* ============================================
           4. ACTUALIZAR RESULTADOS
        ============================================ */

        setItems((previous) => {
          if (!append) {
            return newItems;
          }

          const existingIds = new Set(
            previous.map((item) => item.mentorship.id),
          );

          return [
            ...previous,
            ...newItems.filter((item) => !existingIds.has(item.mentorship.id)),
          ];
        });

        setHasMore(repository.hasMore);

        setNextOffset(
          typeof repository.nextOffset === "number"
            ? repository.nextOffset
            : null,
        );

        setError("");

        /* ============================================
           5. MEDIR RENDIMIENTO
        ============================================ */

        console.log("[Repositorio] Página cargada:", {
          offset,
          registrosRecibidos: newItems.length,
          totalEvidencias: newItems.reduce(
            (total, item) => total + item.evidencias.length,
            0,
          ),
          hasMore: repository.hasMore,
          nextOffset: repository.nextOffset,
          tiempoMs: Math.round(performance.now() - inicio),
        });
      } catch (loadError) {
        if (signal?.aborted || !mountedRef.current || isAbortError(loadError)) {
          return;
        }

        console.error("[Repositorio] Error cargando evidencias:", loadError);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las evidencias.",
        );
      } finally {
        if (append) {
          loadingMoreRef.current = false;
        }

        if (!signal?.aborted && mountedRef.current) {
          if (append) {
            setLoadingMore(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [],
  );

  /* =====================================================
     CARGA INICIAL
  ===================================================== */

  useEffect(() => {
    mountedRef.current = true;

    const controller = new AbortController();
    requestsRef.current.add(controller);

    void loadEvidenceMentorships(0, false, controller.signal).finally(() => {
      requestsRef.current.delete(controller);
    });

    return () => {
      mountedRef.current = false;

      for (const request of requestsRef.current) {
        request.abort();
      }

      requestsRef.current.clear();
      loadingMoreRef.current = false;
    };
  }, [loadEvidenceMentorships]);

  /* =====================================================
     CARGAR MÁS
  ===================================================== */

  function loadMore() {
    if (loading || loadingMoreRef.current || !hasMore || nextOffset === null) {
      return;
    }

    const controller = new AbortController();
    requestsRef.current.add(controller);

    void loadEvidenceMentorships(nextOffset, true, controller.signal).finally(
      () => {
        requestsRef.current.delete(controller);
      },
    );
  }

  /* =====================================================
     INTERFAZ
  ===================================================== */

  return (
    <main className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">SEGUIMIENTO A LOS MENTEES BAJO DE MENTORIA</p>

          <h1>Repositorio de Evidencias de mis Mentees</h1>

          <p className="intro">
            Revisa las evidencias de avance enviadas por tus mentees.
          </p>
        </div>
      </section>

      {/* MENSAJE DE ERROR */}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {/* ESTADO DE CARGA INICIAL */}

      {loading ? (
        <div className="empty-state">
          <h2>Cargando evidencias...</h2>

          <p>Estamos revisando las mentorías realizadas.</p>
        </div>
      ) : items.length === 0 ? (
        /* SIN EVIDENCIAS */

        <div className="empty-state">
          <h2>No hay evidencias todavía</h2>

          <p>Cuando un mentee envíe una evidencia, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          {/* ============================================
              LISTADO DE EVIDENCIAS
          ============================================ */}

          <section className={styles.list}>
            {items.map(({ mentorship, evidencias }) => {
              const latestEvidence = getLatestEvidence(evidencias);

              return (
                <article className={styles.card} key={mentorship.id}>
                  <div className={styles.content}>
                    <p className="eyebrow">EVIDENCIAS DE AVANCE DEL MENTEE:</p>

                    <h2>{mentorship.menteeName || "Mentee PROUNI"}</h2>

                    {mentorship.menteeEmail && (
                      <p className={styles.email}>{mentorship.menteeEmail}</p>
                    )}

                    <div className={styles.info}>
                      <p>
                        <strong>Enviado el:</strong>{" "}
                        {formatDate(latestEvidence.created_at)}
                      </p>

                      <p>
                        <strong>Fecha de la cita:</strong>{" "}
                        {formatDate(mentorship.startDateTime?.dateTime)}
                      </p>

                      <p>
                        <strong>Evidencias:</strong> {evidencias.length}
                      </p>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <Link
                      className={styles.viewButton}
                      href={`/evidencias/${encodeURIComponent(mentorship.id)}`}
                    >
                      Ver evidencias
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>

          {/* ============================================
              PAGINACIÓN
          ============================================ */}

          {hasMore && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 24,
                paddingBottom: 20,
              }}
            >
              <button
                type="button"
                className="primary-button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
