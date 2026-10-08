"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FileCheck2,
  Search,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

import ModalReporte from "./ModalReporte";

import "./acuerdos.css";

type Agreement = {
  id: string;
  titulo: string | null;
  descripción: string | null;
  observación: string | null;
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

export default function AcuerdosPage() {
  const [agreements, setAgreements] =
    useState<Agreement[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    reportModalOpen,
    setReportModalOpen,
  ] = useState(false);

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
        throw new Error(
          "No se encontró una sesión activa.",
        );
      }

      const response = await fetch(
        "/api/coordinador/acuerdos",
        {
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar los acuerdos.",
        );
      }

      setAgreements(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los acuerdos.",
      );
    } finally {
      setLoading(false);
    }
  }

  function personName(
    person:
      | Agreement["mentee"]
      | Agreement["mentor"],
  ) {
    if (!person) {
      return "Sin asignar";
    }

    return (
      [
        person.nombre,
        person.apellido,
      ]
        .filter(Boolean)
        .join(" ") ||
      person.email ||
      "Sin nombre"
    );
  }

  function formatDate(
    value: string | null,
  ) {
    if (!value) {
      return "Sin fecha";
    }

    const date = new Date(
      `${value}T00:00:00`,
    );

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(
      "es-PE",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      },
    );
  }

  const filteredAgreements =
    useMemo(() => {
      const value =
        search
          .trim()
          .toLowerCase();

      if (!value) {
        return agreements;
      }

      return agreements.filter(
        (agreement) => {
          const text = [
            personName(
              agreement.mentee,
            ),

            agreement.mentee?.email ??
              "",

            personName(
              agreement.mentor,
            ),

            agreement.mentor?.email ??
              "",

            agreement.titulo ?? "",

            agreement.descripción ??
              "",

            agreement.observación ??
              "",

            agreement.estado_visual
              ?.label ?? "",
          ]
            .join(" ")
            .toLowerCase();

          return text.includes(value);
        },
      );
    }, [
      agreements,
      search,
    ]);

  async function handleDownload(
    fechaInicial: string,
    fechaFinal: string,
  ) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "No se encontró una sesión activa.",
        );
      }

      const response = await fetch(
        `/api/coordinador/acuerdos/reporte?fechaInicial=${encodeURIComponent(
          fechaInicial,
        )}&fechaFinal=${encodeURIComponent(
          fechaFinal,
        )}`,
        {
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          errorText ||
            "No se pudo generar el reporte.",
        );
      }

      const blob =
        await response.blob();

      const url =
        window.URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `reporte-mentorias-${fechaInicial}-al-${fechaFinal}.pdf`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "No se pudo descargar el reporte.",
      );
    }
  }

  /*
  Funcionalidad pendiente de implementación.

  function handleSendEmail(
    fechaInicial: string,
    fechaFinal: string,
  ) {
    alert(
      `Envío seleccionado: ${fechaInicial} hasta ${fechaFinal}`,
    );
  }
  */

  return (
    <div className="agreements-page">

      <div className="agreements-header">

        <div>
          <p className="agreements-eyebrow">
            GESTIÓN DE MENTORÍAS
          </p>

          <h1>
              Repositorios de acuerdos Mentor - Mentee
          </h1>

          <p className="agreements-description">
            Consulta los acuerdos establecidos
            durante las mentorías.
          </p>
        </div>

        <button
          type="button"
          className="agreements-report-button"
          onClick={() =>
            setReportModalOpen(true)
          }
        >
          <FileCheck2 size={17} />

          Generar reporte
        </button>

      </div>

      {error && (
        <div className="agreements-error">
          {error}
        </div>
      )}

      <section className="agreements-panel">

        <div className="agreements-toolbar">

          <div>
            <h2>
              Acuerdos registrados
            </h2>

            <p>
              Visualiza las partes involucradas,
              el compromiso, fecha límite y estado.
            </p>
          </div>

          <div className="agreements-search-wrapper">

            <Search size={18} />

            <input
              type="text"
              placeholder="Buscar mentee, mentor o acuerdo..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              className="agreements-search"
            />

          </div>

        </div>

        {loading ? (
          <div className="agreements-empty">
            Cargando acuerdos...
          </div>
        ) : filteredAgreements.length ===
          0 ? (
          <div className="agreements-empty">

            <FileCheck2 size={32} />

            <h3>
              No hay acuerdos
            </h3>

            <p>
              No se encontraron acuerdos
              registrados.
            </p>

          </div>
        ) : (
          <div className="agreements-list">

            {filteredAgreements.map(
              (agreement) => (
                <article
                  key={agreement.id}
                  className="agreement-card"
                >

                  <div className="agreement-main">

                    <div className="agreement-mentee">

                      <span className="agreement-label">
                        Mentee
                      </span>

                      <strong>
                        {personName(
                          agreement.mentee,
                        )}
                      </strong>

                      {agreement.mentee
                        ?.email && (
                        <span>
                          {
                            agreement
                              .mentee
                              .email
                          }
                        </span>
                      )}

                    </div>

                    <div className="agreement-mentor">

                      <span className="agreement-label">
                        Mentor
                      </span>

                      <strong>
                        {personName(
                          agreement.mentor,
                        )}
                      </strong>

                      {agreement.mentor
                        ?.email && (
                        <span>
                          {
                            agreement
                              .mentor
                              .email
                          }
                        </span>
                      )}

                    </div>

                    <div className="agreement-content">

                      <span className="agreement-label">
                        Acuerdo
                      </span>

                      <strong>
                        {agreement.titulo ||
                          "Sin título"}
                      </strong>

                      {agreement
                        .descripción && (
                        <p>
                          {
                            agreement
                              .descripción
                          }
                        </p>
                      )}

                    </div>

                    <div className="agreement-deadline">

                      <span className="agreement-label">
                        Fecha límite
                      </span>

                      <strong>
                        {formatDate(
                          agreement.fecha_limite,
                        )}
                      </strong>

                    </div>

                    <div className="agreement-status">

                      <span className="agreement-label">
                        Estado
                      </span>

                      <span
                        className={`agreement-status-badge agreement-status-${agreement.estado_visual?.key ?? "definido"}`}
                      >
                        {
                          agreement
                            .estado_visual
                            ?.label
                        }
                      </span>

                    </div>

                  </div>

                </article>
              ),
            )}

          </div>
        )}

      </section>

      {reportModalOpen && (
        <ModalReporte
          onClose={() =>
            setReportModalOpen(
              false,
            )
          }
          onDownload={
            handleDownload
          }
        />
      )}

    </div>
  );
}
