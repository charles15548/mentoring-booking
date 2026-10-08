"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./mentor-agreements.module.css";

type Agreement = {
id: string;
titulo: string;
descripcion: string | null;
observacion: string | null;
estado: "pendiente" | "en_progreso" | "cumplido" | "cancelado";
fecha_limite: string | null;
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

type AgreementEvidence = {
agreement: Agreement;
evidencias: Evidence[];
};

const statusLabels: Record<Agreement["estado"], string> = {
pendiente: "Pendiente",
en_progreso: "En progreso",
cumplido: "Cumplido",
cancelado: "Cancelado",
};

function formatDate(value: string) {
return new Date(value).toLocaleString("es-PE", {
dateStyle: "medium",
timeStyle: "short",
timeZone: "America/Lima",
});
}

export default function MentorEvidenceDetail({
bookingId,
}: {
bookingId: string;
}) {
const [items, setItems] = useState<AgreementEvidence[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

useEffect(() => {
void loadEvidence();
}, [bookingId]);

async function getAccessToken() {
const {
data: { session },
} = await supabase.auth.getSession();


return session?.access_token ?? null;


}

async function request(
path: string,
init?: RequestInit,
) {
const accessToken = await getAccessToken();


if (!accessToken) {
  throw new Error(
    "No se encontró la sesión activa.",
  );
}

const response = await fetch(path, {
  ...init,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    ...init?.headers,
  },
});

const data = await response.json();

if (!response.ok) {
  throw new Error(
    data.error ||
      "No se pudo completar la operación.",
  );
}

return data;


}

async function loadEvidence() {
try {
setLoading(true);
setError("");


  const agreements = await request(
    `/api/mentors/acuerdos?bookingId=${encodeURIComponent(
      bookingId,
    )}`,
  );

  const results: AgreementEvidence[] = [];

  for (const agreement of agreements as Agreement[]) {
    const evidencias = await request(
      `/api/mentors/evidencias?acuerdoId=${encodeURIComponent(
        agreement.id,
      )}`,
    );

    if (
      Array.isArray(evidencias) &&
      evidencias.length > 0
    ) {
      results.push({
        agreement,
        evidencias,
      });
    }
  }

  setItems(results);
} catch (loadError) {
  console.error(
    "Error cargando detalle de evidencias:",
    loadError,
  );

  setError(
    loadError instanceof Error
      ? loadError.message
      : "No se pudieron cargar las evidencias.",
  );
} finally {
  setLoading(false);
}


}

return ( <main className="page-content"> <section className="welcome-row"> <div> <p className="eyebrow">
SEGUIMIENTO </p>


      <h1>Evidencias del Mentee</h1>

      <p className="intro">
        Revisa las evidencias enviadas para cada
        acuerdo de esta mentoría.
      </p>
    </div>
  </section>

  <Link
    className={styles.backLink}
    href="/evidencias"
  >
    ← Volver a Repositorio de Evidencias
  </Link>

  {error && (
    <p className="form-error">
      {error}
    </p>
  )}

  {loading ? (
    <div className="empty-state">
      <h2>
        Cargando evidencias...
      </h2>

      <p>
        Estamos obteniendo los archivos enviados
        por el mentee.
      </p>
    </div>
  ) : items.length === 0 ? (
    <div className="empty-state">
      <h2>
        No hay evidencias disponibles
      </h2>

      <p>
        Esta mentoría no tiene evidencias
        registradas.
      </p>
    </div>
  ) : (
    <section className="reservation-list">
      {items.map(
        ({ agreement, evidencias }) => (
          <article
            className="reservation-card"
            key={agreement.id}
          >
            <div>
              <p className="eyebrow">
                {statusLabels[agreement.estado]}
              </p>

              <h2>
                {agreement.titulo}
              </h2>

              {agreement.descripcion && (
                <p>
                  {agreement.descripcion}
                </p>
              )}

              {agreement.observacion && (
                <p>
                  <strong>
                    Observación:
                  </strong>{" "}
                  {agreement.observacion}
                </p>
              )}

              {agreement.fecha_limite && (
                <p>
                  <strong>
                    Fecha límite:
                  </strong>{" "}
                  {new Date(
                    `${agreement.fecha_limite}T00:00:00`,
                  ).toLocaleDateString(
                    "es-PE",
                  )}
                </p>
              )}
            </div>

            <div
              className={
                styles.evidenceList
              }
            >
              <h3>
                Evidencias enviadas
              </h3>

              {evidencias.map(
                (evidence) => (
                  <div
                    className={
                      styles.evidenceItem
                    }
                    key={evidence.id}
                  >
                    <div
                      className={
                        styles.evidenceFile
                      }
                    >
                      <span>📎</span>

                      <div
                        className={
                          styles.evidenceFileInfo
                        }
                      >
                        <span
                          className={
                            styles.evidenceFileName
                          }
                          title={
                            evidence.nombre_archivo
                          }
                        >
                          {
                            evidence.nombre_archivo
                          }
                        </span>

                        <span
                          className={
                            styles.evidenceDate
                          }
                        >
                          Enviado el{" "}
                          {formatDate(
                            evidence.created_at,
                          )}
                        </span>
                      </div>
                    </div>

                    {evidence.url && (
                      <a
                        className={
                          styles.viewEvidenceButton
                        }
                        href={
                          evidence.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver archivo
                      </a>
                    )}
                  </div>
                ),
              )}
            </div>
          </article>
        ),
      )}
    </section>
  )}
</main>

);
}
