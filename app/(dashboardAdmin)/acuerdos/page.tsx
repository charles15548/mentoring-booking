"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileCheck2,
  Search,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";
import ModalReporte from "./ModalReporte";
import "./acuerdos.css";

type Agreement = {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  observacion: string | null;
  estado: string;
  fecha_limite: string | null;
  created_at: string;

  estado_visual?: {
    key: string;
    label: string;
  };

  mentee?: {
    id: string;
    nombre: string | null;
    apellido: string | null;
    email: string | null;
  } | null;

  mentor?: {
    id: string;
    nombre: string | null;
    apellido: string | null;
    email: string | null;
  } | null;
};

const PAGE_SIZE = 5;
const TIME_ZONE = "America/Lima";

function personName(person: Agreement["mentee"] | Agreement["mentor"]) {
  if (!person) return "Sin asignar";

  return (
    [person.nombre, person.apellido].filter(Boolean).join(" ") ||
    person.email ||
    "Sin nombre"
  );
}

function formatDeadline(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRegisteredAt(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const result: (number | "...")[] = [1];

  if (current > 3) {
    result.push("...");
  }

  for (
    let number = Math.max(2, current - 1);
    number <= Math.min(total - 1, current + 1);
    number++
  ) {
    result.push(number);
  }

  if (current < total - 2) {
    result.push("...");
  }

  result.push(total);

  return result;
}

export default function AcuerdosPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);

  /* =====================================================
     CONSULTAR ACUERDOS
  ===================================================== */

  useEffect(() => {
    void loadAgreements();
  }, []);

  async function loadAgreements() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No se encontró una sesión activa.");
      }

      const response = await fetch("/api/coordinador/acuerdos", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron cargar los acuerdos.");
      }

      if (!Array.isArray(data)) {
        throw new Error("No se pudo obtener la información de los acuerdos.");
      }

      setAgreements(data as Agreement[]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudieron cargar los acuerdos.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     FILTROS
  ===================================================== */

  const filteredAgreements = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return agreements;

    return agreements.filter((agreement) => {
      const text = [
        personName(agreement.mentee),
        agreement.mentee?.email ?? "",
        personName(agreement.mentor),
        agreement.mentor?.email ?? "",
        agreement.titulo ?? "",
        agreement.descripcion ?? "",
        agreement.observacion ?? "",
        agreement.estado_visual?.label ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(value);
    });
  }, [agreements, search]);

  /* =====================================================
     PAGINACIÓN
  ===================================================== */

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAgreements.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredAgreements.length);

  const pagedAgreements = filteredAgreements.slice(startIndex, endIndex);

  const visiblePageNumbers = useMemo(
    () => pageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }

    setPage(nextPage);
    setExpandedId(null);
  }

  function toggleDetail(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  /* =====================================================
     GENERAR Y DESCARGAR REPORTE
  ===================================================== */

  async function handleDownload(fechaInicial: string, fechaFinal: string) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No se encontró una sesión activa.");
      }

      const response = await fetch(
        `/api/coordinador/acuerdos/reporte?fechaInicial=${encodeURIComponent(
          fechaInicial,
        )}&fechaFinal=${encodeURIComponent(fechaFinal)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(errorText || "No se pudo generar el reporte.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `reporte-mentorias-${fechaInicial}-al-${fechaFinal}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (reason) {
      window.alert(
        reason instanceof Error
          ? reason.message
          : "No se pudo descargar el reporte.",
      );
    }
  }

  /* =====================================================
     INTERFAZ
  ===================================================== */

  return (
    <div className="agreements-page">
      {/* CABECERA */}

      <div className="agreements-header">
        <div>
          <p className="agreements-eyebrow">GESTIÓN DE MENTORÍAS</p>

          <h1>Repositorio de acuerdos</h1>

          <p className="agreements-description">
            Consulta los acuerdos establecidos durante las mentorías.
          </p>
        </div>

        <button
          type="button"
          className="agreements-report-button"
          onClick={() => setReportModalOpen(true)}
        >
          <FileCheck2 size={17} aria-hidden="true" />
          Generar reporte
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="agreements-error" role="alert">
          {error}
        </div>
      )}

      {/* PANEL */}

      <section className="agreements-panel">
        <div className="agreements-toolbar">
          <div>
            <h2>Acuerdos registrados</h2>

            <p>
              Consulta los compromisos, sus fechas y el estado de cumplimiento.
            </p>
          </div>

          <div className="agreements-search-wrapper">
            <Search size={18} aria-hidden="true" />

            <input
              type="search"
              placeholder="Buscar mentee, mentor o acuerdo..."
              aria-label="Buscar acuerdos"
              className="agreements-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setExpandedId(null);
              }}
            />
          </div>
        </div>

        {/* CARGA */}

        {loading ? (
          <ProUniLoader icon="clipboard" title="Cargando acuerdos" compact />
        ) : error &&
          agreements.length === 0 ? null : filteredAgreements.length === 0 ? (
          <div className="agreements-empty">
            <FileCheck2 size={32} aria-hidden="true" />

            <h3>
              {search.trim()
                ? "No se encontraron resultados"
                : "No hay acuerdos"}
            </h3>

            <p>
              {search.trim()
                ? "Prueba con otro criterio de búsqueda."
                : "No se encontraron acuerdos registrados."}
            </p>
          </div>
        ) : (
          <>
            {/* LISTADO */}

            <div className="agreements-list">
              {pagedAgreements.map((agreement) => {
                const expanded = expandedId === agreement.id;

                const detailId = `agreement-detail-${agreement.id}`;

                return (
                  <article
                    key={agreement.id}
                    className={`agreement-card ${
                      expanded ? "agreement-card-expanded" : ""
                    }`}
                  >
                    <div className="agreement-main">
                      {/* MENTEE */}

                      <div className="agreement-mentee">
                        <span className="agreement-label">Mentee</span>

                        <strong>{personName(agreement.mentee)}</strong>

                        {agreement.mentee?.email && (
                          <span title={agreement.mentee.email}>
                            {agreement.mentee.email}
                          </span>
                        )}
                      </div>

                      {/* MENTOR */}

                      <div className="agreement-mentor">
                        <span className="agreement-label">Mentor</span>

                        <strong>{personName(agreement.mentor)}</strong>

                        {agreement.mentor?.email && (
                          <span title={agreement.mentor.email}>
                            {agreement.mentor.email}
                          </span>
                        )}
                      </div>

                      {/* ACUERDO Y DETALLE */}

                      <div className="agreement-content">
                        <span className="agreement-label">Acuerdo</span>

                        <strong>{agreement.titulo || "Sin título"}</strong>

                        <button
                          type="button"
                          className="agreement-detail-button"
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          onClick={() => toggleDetail(agreement.id)}
                        >
                          {expanded ? "Ocultar detalle" : "Ver detalle"}

                          {expanded ? (
                            <ChevronUp size={15} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={15} aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      {/* FECHA DE REGISTRO */}

                      <div className="agreement-registered">
                        <span className="agreement-label">
                          Fecha de registro
                        </span>

                        <strong>
                          {formatRegisteredAt(agreement.created_at)}
                        </strong>
                      </div>

                      {/* FECHA LÍMITE */}

                      <div className="agreement-deadline">
                        <span className="agreement-label">Fecha límite</span>

                        <strong>
                          {formatDeadline(agreement.fecha_limite)}
                        </strong>
                      </div>

                      {/* ESTADO */}

                      <div className="agreement-status">
                        <span className="agreement-label">Estado</span>

                        <span
                          className={`agreement-status-badge agreement-status-${
                            agreement.estado_visual?.key ?? "definido"
                          }`}
                        >
                          {agreement.estado_visual?.label ?? "Sin estado"}
                        </span>
                      </div>
                    </div>

                    {/* DETALLE DESPLEGABLE */}

                    {expanded && (
                      <div id={detailId} className="agreement-detail">
                        <div className="agreement-detail-grid">
                          <div className="agreement-detail-field">
                            <h3>Descripción</h3>

                            <p>
                              {agreement.descripcion?.trim() ||
                                "Sin descripción registrada."}
                            </p>
                          </div>

                          <div className="agreement-detail-field">
                            <h3>Observaciones</h3>

                            <p>
                              {agreement.observacion?.trim() ||
                                "Sin observaciones registradas."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* PAGINACIÓN */}

            <nav
              className="agreements-pagination"
              aria-label="Paginación de acuerdos"
            >
              <p className="agreements-pagination-text">
                Mostrando {startIndex + 1}–{endIndex} de{" "}
                {filteredAgreements.length} acuerdos
              </p>

              {totalPages > 1 && (
                <div className="agreements-pagination-controls">
                  <button
                    type="button"
                    className="agreements-page-button"
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                    Anterior
                  </button>

                  {visiblePageNumbers.map((number, index) =>
                    number === "..." ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="agreements-page-ellipsis"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={number}
                        type="button"
                        className={`agreements-page-button agreements-page-number ${
                          number === currentPage ? "agreements-page-active" : ""
                        }`}
                        onClick={() => changePage(number)}
                        aria-label={`Página ${number}`}
                        aria-current={
                          number === currentPage ? "page" : undefined
                        }
                      >
                        {number}
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    className="agreements-page-button"
                    onClick={() => changePage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </nav>
          </>
        )}
      </section>

      {/* MODAL DE REPORTE */}

      {reportModalOpen && (
        <ModalReporte
          onClose={() => setReportModalOpen(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
