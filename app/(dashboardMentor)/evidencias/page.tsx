"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  FolderOpen,
  UserRound,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";
import styles from "./evidencias.module.css";

type Mentorship = {
  id: string;
  serviceName?: string;
  menteeName?: string;
  menteeEmail?: string;
  menteeFotoUrl?: string | null;
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

const PAGE_SIZE = 20;

function formatDate(value?: string) {
  if (!value) return "Fecha por confirmar";

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
   AVATAR DEL MENTEE
===================================================== */

function MenteeAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl;

  return (
    <div className={styles.avatar}>
      {showPhoto && photoUrl ? (
        <img
          src={photoUrl}
          alt={`Foto de ${name}`}
          className={styles.avatarImage}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        <UserRound size={21} aria-hidden="true" />
      )}
    </div>
  );
}

/* =====================================================
   REPOSITORIO
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
     CARGA PAGINADA
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
            Boolean(item.mentorship?.id) &&
            Array.isArray(item.evidencias) &&
            item.evidencias.length > 0,
        );

        setItems((previous) => {
          if (!append) return newItems;

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

        console.log("[Repositorio] Página cargada:", {
          offset,
          registrosRecibidos: newItems.length,
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

  return (
    <main className={`page-content ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.heading}>
          Repositorio de Evidencias de mis Mentees
        </h1>

        <p className={styles.description}>
          Revisa las evidencias de avance enviadas por tus mentees.
        </p>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {/* =====================================================
          INDICADOR INSTITUCIONAL DE CARGA
      ===================================================== */}

      {loading ? (
        <ProUniLoader
          icon="clipboard"
          title="Consultando evidencias"
          description="Un momento, estamos obteniendo las evidencias de tus mentees."
        />
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <FolderOpen size={28} />

          <h2>No hay evidencias todavía</h2>

          <p>Cuando un mentee envíe una evidencia, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <section
            className={styles.grid}
            aria-label="Mentorías con evidencias"
          >
            {items.map(({ mentorship, evidencias }) => {
              const latest = getLatestEvidence(evidencias);

              const name = mentorship.menteeName || "Mentee PROUNI";

              return (
                <article key={mentorship.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <MenteeAvatar
                      name={name}
                      photoUrl={mentorship.menteeFotoUrl}
                    />

                    <div className={styles.studentInfo}>
                      <span className={styles.cardEyebrow}>MENTEE</span>

                      <h2 className={styles.studentName}>{name}</h2>

                      {mentorship.menteeEmail && (
                        <p
                          className={styles.email}
                          title={mentorship.menteeEmail}
                        >
                          {mentorship.menteeEmail}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.evidenceSummary}>
                      <div className={styles.summaryIcon}>
                        <FileText size={17} />
                      </div>

                      <span>Evidencias enviadas</span>

                      <strong>{evidencias.length}</strong>
                    </div>

                    <div className={styles.metaList}>
                      <div className={styles.metaRow}>
                        <CalendarDays size={15} />

                        <span>
                          <b>Mentoría:</b>{" "}
                          {formatDate(mentorship.startDateTime?.dateTime)}
                        </span>
                      </div>

                      <div className={styles.metaRow}>
                        <Clock3 size={15} />

                        <span>
                          <b>Último envío:</b> {formatDate(latest.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    className={styles.viewButton}
                    href={`/evidencias/${encodeURIComponent(mentorship.id)}`}
                  >
                    <FolderOpen size={16} />
                    Ver evidencias
                    <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </section>

          {hasMore && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.loadMoreButton}
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
