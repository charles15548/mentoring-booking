"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  FileBarChart2,
  FileDown,
  History,
  UserRound,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import ProUniLoader from "@/components/ui/ProUniLoader";
import styles from "./mentor-reports.module.css";

type AgreementStatus = "pendiente" | "en_progreso" | "cumplido" | "cancelado";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: AgreementStatus;
  fechaLimite: string | null;
};

type Counts = {
  totalAcuerdos: number;
  cumplidos: number;
  pendientes: number;
  enProgreso: number;
  cancelados: number;
};

type ReportSession = {
  bookingId: string;
  fecha: string | null;
  servicio: string;
  mentee: {
    nombre: string;
    email: string;
    fotoUrl: string | null;
  };
  conteo: Counts;
  acuerdos: Agreement[];
};

type ReportResponse = {
  mentor: {
    id: string;
    nombre: string;
  };
  periodo: {
    desde: string;
    hasta: string;
  };
  totales: Counts & {
    totalMentorias: number;
  };
  sesiones: ReportSession[];
};

type HistoryItem = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo_periodo: string;
  version: number;
  total_mentorias: number;
  total_acuerdos: number;
  acuerdos_cumplidos: number;
  fecha_generacion: string;
  archivo_ruta: string | null;
};

type PeriodType = "mensual" | "personalizado";
type TabType = "reporte" | "historial";

const TIME_ZONE = "America/Lima";

const statusLabels: Record<AgreementStatus, string> = {
  cumplido: "Cumplido",
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  cancelado: "Cancelado",
};

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "2026";

  const month = parts.find((part) => part.type === "month")?.value ?? "01";

  return `${year}-${month}`;
}

function monthRange(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return { desde: "", hasta: "" };
  }

  const [year, month] = value.split("-").map(Number);

  const final = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    desde: `${value}-01`,
    hasta: `${value}-${String(final).padStart(2, "0")}`,
  };
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

function formatOnlyDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T12:00:00Z`);

  return date.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

async function getToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("No se encontró la sesión activa.");
  }

  return session.access_token;
}

async function readJson(response: Response) {
  const value: unknown = await response.json();

  if (!response.ok) {
    const error =
      value && typeof value === "object" && "error" in value
        ? String(value.error)
        : "No se pudo completar la operación.";

    throw new Error(error);
  }

  return value;
}

function MenteeAvatar({ name, url }: { name: string; url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <div className={styles.avatarFrame}>
      <div className={styles.avatar}>
        {url && failedUrl !== url ? (
          <img
            src={url}
            alt={`Foto de ${name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <UserRound size={23} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export default function MentorReports() {
  const [tab, setTab] = useState<TabType>("reporte");
  const [periodType, setPeriodType] = useState<PeriodType>("mensual");

  const [month, setMonth] = useState(currentMonth);

  const [dateFrom, setDateFrom] = useState(
    () => monthRange(currentMonth()).desde,
  );

  const [dateTo, setDateTo] = useState(() => monthRange(currentMonth()).hasta);

  const [report, setReport] = useState<ReportResponse | null>(null);

  const [loadedRange, setLoadedRange] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [loadingHistory, setLoadingHistory] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  const [modalReport, setModalReport] = useState<{
    report: ReportResponse;
    desde: string;
    hasta: string;
    periodType: PeriodType;
  } | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  const range =
    periodType === "mensual"
      ? monthRange(month)
      : { desde: dateFrom, hasta: dateTo };

  const { desde, hasta } = range;
  const rangeKey = `${desde}|${hasta}`;

  const isCurrent = report !== null && loadedRange === rangeKey;

  const hasMentorships = isCurrent && (report?.totales.totalMentorias ?? 0) > 0;

  const hasAgreements = isCurrent && (report?.totales.totalAcuerdos ?? 0) > 0;

  /* =========================================
     CONSULTA AUTOMÁTICA
  ========================================= */

  useEffect(() => {
    if (tab !== "reporte") return;

    const controller = new AbortController();
    let active = true;

    setReport(null);
    setLoadedRange(null);
    setExpandedId(null);
    setError("");

    if (!desde || !hasta || desde > hasta) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const token = await getToken();

        if (!active) return;

        const params = new URLSearchParams({
          desde,
          hasta,
        });

        const response = await fetch(
          `/api/mentors/reportes/consulta?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = (await readJson(response)) as ReportResponse;

        if (!active) return;

        setReport(data);
        setLoadedRange(rangeKey);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "No se pudo consultar el reporte.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tab, desde, hasta, rangeKey]);

  /* =========================================
     HISTORIAL
  ========================================= */

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setError("");

      const token = await getToken();

      const response = await fetch("/api/mentors/reportes", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await readJson(response)) as HistoryItem[];

      setHistory(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el historial.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "historial") {
      void loadHistory();
    }
  }, [tab, loadHistory]);

  /* =========================================
     ABRIR MODAL
  ========================================= */

  function openModal() {
    if (
      !report ||
      !isCurrent ||
      loading ||
      generating ||
      report.totales.totalMentorias === 0
    ) {
      return;
    }

    setModalReport({
      report,
      desde: report.periodo.desde,
      hasta: report.periodo.hasta,
      periodType,
    });

    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (generating) return;

    setModalOpen(false);
    setModalReport(null);
    setModalError("");
  }

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) {
        closeModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    modalRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen, generating]);

  /* =========================================
     DESCARGA DIRECTA DEL PDF
  ========================================= */

  async function saveDownload(signedUrl: string, filename: string) {
    const response = await fetch(signedUrl);

    if (!response.ok) {
      throw new Error("No se pudo descargar el archivo PDF.");
    }

    const blob = await response.blob();

    const objectUrl = URL.createObjectURL(
      new Blob([blob], {
        type: "application/pdf",
      }),
    );

    try {
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    }
  }

  /* =========================================
     GENERAR Y DESCARGAR DESDE MODAL
  ========================================= */

  async function generatePdf() {
    if (!modalReport || generating) return;

    const selection = modalReport;

    try {
      setGenerating(true);
      setModalError("");

      const token = await getToken();

      const response = await fetch("/api/mentors/reportes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          desde: selection.desde,
          hasta: selection.hasta,
          tipoPeriodo: selection.periodType,
        }),
      });

      const data = (await readJson(response)) as {
        id: string;
        version: number;
        url: string | null;
      };

      // Si no se pudo crear el enlace inicial,
      // solicitarlo al historial con el ID.
      let downloadUrl = data.url;

      if (!downloadUrl) {
        const downloadResponse = await fetch(
          `/api/mentors/reportes?id=${encodeURIComponent(data.id)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const downloadData = (await readJson(downloadResponse)) as {
          url: string;
        };

        downloadUrl = downloadData.url;
      }

      if (!downloadUrl) {
        throw new Error(
          "El reporte se guardó, pero no se pudo obtener su descarga. Puedes recuperarlo desde Historial.",
        );
      }

      await saveDownload(
        downloadUrl,
        `reporte-mentorias-${selection.desde}-${selection.hasta}-v${data.version}.pdf`,
      );

      setModalOpen(false);
      setModalReport(null);
      setModalError("");
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "No se pudo descargar el PDF.",
      );
    } finally {
      setGenerating(false);
    }
  }

  /* =========================================
     DESCARGAR DESDE HISTORIAL
  ========================================= */

  async function downloadHistory(item: HistoryItem) {
    try {
      setDownloadingId(item.id);
      setError("");

      const token = await getToken();

      const response = await fetch(
        `/api/mentors/reportes?id=${encodeURIComponent(item.id)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = (await readJson(response)) as {
        url: string;
      };

      await saveDownload(
        data.url,
        `reporte-mentorias-${item.fecha_inicio}-${item.fecha_fin}-v${item.version}.pdf`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo descargar el reporte.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  /* =========================================
     INTERFAZ
  ========================================= */

  return (
    <main className={`page-content ${styles.page}`}>
      <header className={styles.header}>
        <h1>Reporte de avance de mis mentees</h1>
        <p>
          Consulta tus mentorías realizadas y el cumplimiento de los acuerdos
          por período.
        </p>
      </header>

      <div className={styles.periodTabs} style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={tab === "reporte" ? styles.periodActive : ""}
          onClick={() => setTab("reporte")}
        >
          <FileBarChart2
            size={15}
            style={{
              verticalAlign: "middle",
              marginRight: 7,
            }}
          />
          Generar reporte
        </button>

        <button
          type="button"
          className={tab === "historial" ? styles.periodActive : ""}
          onClick={() => setTab("historial")}
        >
          <History
            size={15}
            style={{
              verticalAlign: "middle",
              marginRight: 7,
            }}
          />
          Historial
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {tab === "reporte" && (
        <>
          <section className={styles.filterCard}>
            <div className={styles.sectionTitle}>
              <CalendarDays size={19} />
              <h2>Período del reporte</h2>
            </div>

            <div className={styles.periodTabs}>
              <button
                type="button"
                className={periodType === "mensual" ? styles.periodActive : ""}
                onClick={() => setPeriodType("mensual")}
              >
                Mensual
              </button>

              <button
                type="button"
                className={
                  periodType === "personalizado" ? styles.periodActive : ""
                }
                onClick={() => setPeriodType("personalizado")}
              >
                Personalizado
              </button>
            </div>

            <div className={styles.filterFields}>
              {periodType === "mensual" ? (
                <label className={styles.field}>
                  <span>Mes y año</span>

                  <input
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Desde</span>

                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(event) => setDateFrom(event.target.value)}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Hasta</span>

                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(event) => setDateTo(event.target.value)}
                    />
                  </label>
                </>
              )}

              <button
                type="button"
                className={styles.searchButton}
                disabled={loading || generating || !hasMentorships}
                onClick={openModal}
              >
                <FileDown size={17} />
                Generar reporte
              </button>
            </div>
          </section>

          {loading && (
            <ProUniLoader
              icon="chart"
              title="Consultando información de avance"
              description="Un momento, estamos preparando los datos de tus mentorías."
            />
          )}

          {!loading &&
            isCurrent &&
            report &&
            report.totales.totalMentorias === 0 && (
              <div className={styles.emptyState}>
                <CalendarDays size={30} />

                <strong>No hay mentorías realizadas</strong>

                <span>
                  No se encontraron mentorías finalizadas durante el período
                  seleccionado.
                </span>
              </div>
            )}

          {!loading && hasMentorships && report && (
            <>
              <section className={styles.reportHeading}>
                <div>
                  <span className={styles.eyebrow}>RESULTADOS DEL PERÍODO</span>

                  <h2>
                    {periodType === "mensual"
                      ? formatMonth(month)
                      : `${desde} al ${hasta}`}
                  </h2>

                  <p>
                    Mentor: <strong>{report.mentor.nombre}</strong>
                  </p>
                </div>
              </section>

              <section
                className={styles.statsGrid}
                aria-label="Indicadores del reporte"
              >
                <div className={styles.statCard}>
                  <CalendarDays size={20} />
                  <span>Mentorías realizadas</span>
                  <strong>{report.totales.totalMentorias}</strong>
                </div>

                <div className={styles.statCard}>
                  <ClipboardList size={20} />
                  <span>Acuerdos registrados</span>
                  <strong>{report.totales.totalAcuerdos}</strong>
                </div>

                <div className={styles.statCard}>
                  <CheckCircle2 size={20} />
                  <span>Acuerdos cumplidos</span>
                  <strong>{report.totales.cumplidos}</strong>
                </div>

                <div className={styles.statCard}>
                  <ClipboardList size={20} />
                  <span>Acuerdos por cumplir</span>
                  <strong>
                    {report.totales.pendientes + report.totales.enProgreso}
                  </strong>
                </div>
              </section>

              {hasAgreements ? (
                <section className={styles.statusCard}>
                  <div className={styles.sectionTitle}>
                    <ClipboardList size={19} />

                    <h2>Estado de los acuerdos</h2>
                  </div>

                  <div className={styles.statusGrid}>
                    <div>
                      <span className={styles.dotDone} />
                      Cumplidos
                      <strong>{report.totales.cumplidos}</strong>
                    </div>

                    <div>
                      <span className={styles.dotPending} />
                      Pendientes
                      <strong>{report.totales.pendientes}</strong>
                    </div>

                    <div>
                      <span className={styles.dotProgress} />
                      En progreso
                      <strong>{report.totales.enProgreso}</strong>
                    </div>

                    <div>
                      <span className={styles.dotCancelled} />
                      Cancelados
                      <strong>{report.totales.cancelados}</strong>
                    </div>
                  </div>
                </section>
              ) : (
                <div
                  className={styles.emptyState}
                  style={{
                    minHeight: 115,
                    marginBottom: 20,
                  }}
                >
                  <ClipboardList size={26} />
                  <strong>No hay acuerdos registrados</strong>
                  <span>Las mentorías realizadas aparecen a continuación.</span>
                </div>
              )}

              <section className={styles.sessions}>
                <div className={styles.sessionHeading}>
                  <div>
                    <h2>Mentorías del período</h2>
                    <p>Abre cada mentoría para consultar sus acuerdos.</p>
                  </div>

                  <span className={styles.sessionCount}>
                    {report.sesiones.length}{" "}
                    {report.sesiones.length === 1 ? "mentoría" : "mentorías"}
                  </span>
                </div>

                <div className={styles.sessionList}>
                  {report.sesiones.map((item) => {
                    const open = expandedId === item.bookingId;

                    return (
                      <article
                        key={item.bookingId}
                        className={styles.sessionCard}
                      >
                        <button
                          type="button"
                          className={styles.sessionButton}
                          aria-expanded={open}
                          onClick={() =>
                            setExpandedId(open ? null : item.bookingId)
                          }
                        >
                          <MenteeAvatar
                            name={item.mentee.nombre}
                            url={item.mentee.fotoUrl}
                          />

                          <div className={styles.sessionInfo}>
                            <h3>{item.mentee.nombre}</h3>

                            <p>{formatDate(item.fecha)}</p>

                            <span>
                              {item.conteo.totalAcuerdos} acuerdos ·{" "}
                              {item.conteo.cumplidos} cumplidos
                            </span>
                          </div>

                          {open ? (
                            <ChevronUp size={19} />
                          ) : (
                            <ChevronDown size={19} />
                          )}
                        </button>

                        {open && (
                          <div className={styles.sessionDetail}>
                            {item.acuerdos.length === 0 ? (
                              <p className={styles.noAgreements}>
                                Esta mentoría no tiene acuerdos registrados.
                              </p>
                            ) : (
                              <>
                                <div className={styles.detailSummary}>
                                  <span>
                                    Cumplidos: {item.conteo.cumplidos}
                                  </span>
                                  <span>
                                    Pendientes: {item.conteo.pendientes}
                                  </span>
                                  <span>
                                    En progreso: {item.conteo.enProgreso}
                                  </span>
                                  <span>
                                    Cancelados: {item.conteo.cancelados}
                                  </span>
                                </div>

                                <div className={styles.agreementList}>
                                  {item.acuerdos.map((agreement, index) => (
                                    <div
                                      key={agreement.id}
                                      className={styles.agreementItem}
                                    >
                                      <span className={styles.agreementNumber}>
                                        {index + 1}
                                      </span>

                                      <div className={styles.agreementInfo}>
                                        <strong>{agreement.titulo}</strong>

                                        {agreement.descripcion && (
                                          <p>{agreement.descripcion}</p>
                                        )}
                                      </div>

                                      <span
                                        className={`${styles.statusBadge} ${
                                          styles[`status_${agreement.estado}`]
                                        }`}
                                      >
                                        {statusLabels[agreement.estado]}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {tab === "historial" && (
        <section className={styles.sessions}>
          <div className={styles.sessionHeading}>
            <div>
              <h2>Historial de reportes</h2>
              <p>Consulta y descarga los documentos generados anteriormente.</p>
            </div>
          </div>

          {loadingHistory ? (
            <ProUniLoader
              icon="clipboard"
              title="Consultando historial de reportes"
              description="Un momento, estamos obteniendo tus reportes anteriores."
              compact
            />
          ) : history.length === 0 ? (
            <div className={styles.emptyState}>
              <History size={30} />
              <strong>Todavía no hay reportes</strong>
              <span>Los reportes que descargues aparecerán aquí.</span>
            </div>
          ) : (
            <div className={styles.sessionList}>
              {history.map((item) => (
                <article
                  key={item.id}
                  className={styles.sessionCard}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <FileBarChart2 size={27} color="#81111b" />

                    <div className={styles.sessionInfo}>
                      <h3>
                        {item.fecha_inicio} al {item.fecha_fin}
                      </h3>

                      <p>
                        Versión {item.version} ·{" "}
                        {formatDate(item.fecha_generacion)}
                      </p>

                      <span>
                        {item.total_mentorias} mentorías · {item.total_acuerdos}{" "}
                        acuerdos
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.searchButton}
                    disabled={downloadingId === item.id || !item.archivo_ruta}
                    onClick={() => void downloadHistory(item)}
                  >
                    <Download size={16} />
                    {downloadingId === item.id
                      ? "Descargando..."
                      : "Descargar PDF"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =========================================
          MODAL DE DESCARGA
      ========================================= */}

      {modalOpen && modalReport && (
        <div
          className={styles.reportModalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className={styles.reportModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            tabIndex={-1}
          >
            <div className={styles.reportModalHeader}>
              <div className={styles.reportModalIcon}>
                <FileDown size={23} />
              </div>

              <button
                type="button"
                className={styles.reportModalClose}
                aria-label="Cerrar"
                disabled={generating}
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.reportModalBody}>
              <h2 id="report-modal-title">Descargar reporte de avance</h2>

              <p className={styles.reportModalDescription}>
                Se generará un PDF con los resultados del período seleccionado.
              </p>

              <div className={styles.reportModalSummary}>
                <span className={styles.reportModalLabel}>
                  Período seleccionado
                </span>

                <strong className={styles.reportModalPeriod}>
                  {formatOnlyDate(modalReport.desde)} al{" "}
                  {formatOnlyDate(modalReport.hasta)}
                </strong>

                <div className={styles.reportModalStats}>
                  <div>
                    <span>Mentorías realizadas</span>
                    <strong>{modalReport.report.totales.totalMentorias}</strong>
                  </div>

                  <div>
                    <span>Acuerdos registrados</span>
                    <strong>{modalReport.report.totales.totalAcuerdos}</strong>
                  </div>
                </div>
              </div>

              <p className={styles.reportModalHint}>
                <History size={16} />
                El documento quedará guardado en el historial para futuras
                descargas.
              </p>

              {modalError && (
                <p className={styles.reportModalError} role="alert">
                  {modalError}
                </p>
              )}
            </div>

            <div className={styles.reportModalFooter}>
              <button
                type="button"
                className={styles.reportModalCancel}
                disabled={generating}
                onClick={closeModal}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.reportModalDownload}
                disabled={generating}
                onClick={() => void generatePdf()}
              >
                <Download size={17} />
                {generating ? "Preparando PDF..." : "Descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
