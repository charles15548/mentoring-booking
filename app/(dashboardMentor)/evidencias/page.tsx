"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./evidencias.module.css";

type Mentorship = {
id: string;
serviceName?: string;
menteeName?: string;
menteeEmail?: string;
startDateTime?: {
dateTime: string;
};
};

type Agreement = {
id: string;
microsoft_booking_id: string;
titulo: string;
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

function formatDate(value?: string) {
if (!value) {
return "Fecha por confirmar";
}

return new Date(value).toLocaleString("es-PE", {
dateStyle: "medium",
timeStyle: "short",
timeZone: "America/Lima",
});
}

export default function EvidenciasPage() {
const [items, setItems] = useState<EvidenceMentorship[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

useEffect(() => {
void loadEvidenceMentorships();
}, []);

async function getAccessToken() {
const {
data: { session },
error: sessionError,
} = await supabase.auth.getSession();


if (sessionError) {
  console.error(
    "Error obteniendo sesión:",
    sessionError,
  );

  return null;
}

return session?.access_token ?? null;


}

async function loadEvidenceMentorships() {
try {
setLoading(true);
setError("");


  const token = await getAccessToken();

  if (!token) {
    setError("No se encontró la sesión activa.");
    return;
  }

  /*
   * Obtener las mentorías del Mentor.
   */
  const reservationsResponse = await fetch(
    "/api/mentors/reservas",
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const reservationsData =
    await reservationsResponse.json();

  if (!reservationsResponse.ok) {
    throw new Error(
      reservationsData.error ||
        "No se pudieron cargar las mentorías.",
    );
  }

  const mentorships =
    reservationsData as Mentorship[];

  /*
   * Solo nos interesan las mentorías que ya se realizaron.
   */
  const completedMentorships =
    mentorships.filter((mentorship) => {
      const startDate =
        mentorship.startDateTime?.dateTime;

      if (!startDate) {
        return false;
      }

      return (
        new Date(startDate).getTime() <=
        Date.now()
      );
    });

  const results: EvidenceMentorship[] = [];

  /*
   * Revisar los acuerdos y evidencias de cada mentoría.
   */
  for (const mentorship of completedMentorships) {
    const agreementsResponse = await fetch(
      `/api/mentors/acuerdos?bookingId=${encodeURIComponent(
        mentorship.id,
      )}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const agreementsData =
      await agreementsResponse.json();

    if (!agreementsResponse.ok) {
      console.error(
        "Error obteniendo acuerdos:",
        agreementsData,
      );

      continue;
    }

    const agreements =
      agreementsData as Agreement[];

    const mentorshipEvidence: Evidence[] = [];

    /*
     * Cada acuerdo puede tener una o varias evidencias.
     */
    for (const agreement of agreements) {
      const evidenceResponse = await fetch(
        `/api/mentors/evidencias?acuerdoId=${encodeURIComponent(
          agreement.id,
        )}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const evidenceData =
        await evidenceResponse.json();

      if (!evidenceResponse.ok) {
        console.error(
          "Error obteniendo evidencias:",
          evidenceData,
        );

        continue;
      }

      if (Array.isArray(evidenceData)) {
        mentorshipEvidence.push(
          ...evidenceData,
        );
      }
    }

    /*
     * Mostrar únicamente las mentorías
     * que realmente tienen evidencias.
     */
    if (mentorshipEvidence.length > 0) {
      results.push({
        mentorship,
        evidencias: mentorshipEvidence,
      });
    }
  }

  /*
   * Ordenar por la evidencia más reciente.
   */
  results.sort((first, second) => {
    const firstDate = new Date(
      first.evidencias[0].created_at,
    ).getTime();

    const secondDate = new Date(
      second.evidencias[0].created_at,
    ).getTime();

    return secondDate - firstDate;
  });

  setItems(results);
} catch (loadError) {
  console.error(
    "Error cargando evidencias:",
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

return ( <main className="page-content"> <section className="welcome-row"> <div> <p className="eyebrow">SEGUIMIENTO A LOS MENTEES BAJO DE MENTORIA </p>


      <h1>Repositorio de Evidencias de mis Mentees</h1>

      <p className="intro">
        Revisa las evidencias de avance enviadas
        por tus mentees.
      </p>
    </div>
  </section>

  {error && (
    <p className="form-error">
      {error}
    </p>
  )}

  {loading ? (
    <div className="empty-state">
      <h2>Cargando evidencias...</h2>

      <p>
        Estamos revisando las mentorías realizadas.
      </p>
    </div>
  ) : items.length === 0 ? (
    <div className="empty-state">
      <h2>No hay evidencias todavía</h2>

      <p>
        Cuando un mentee envíe una evidencia,
        aparecerá aquí.
      </p>
    </div>
  ) : (
    <section className={styles.list}>
      {items.map(
        ({ mentorship, evidencias }) => {
          const latestEvidence =
            evidencias.reduce(
              (latest, current) =>
                new Date(
                  current.created_at,
                ).getTime() >
                new Date(
                  latest.created_at,
                ).getTime()
                  ? current
                  : latest,
            );

          return (
            <article
              className={styles.card}
              key={mentorship.id}
            >
              <div className={styles.content}>
                <p className="eyebrow">
                  EVIDENCIAS DE AVANCE DEL MENTEE: 
                </p>

                <h2>
                  {mentorship.menteeName ||
                    "Mentee PROUNI"}
                </h2>

                {mentorship.menteeEmail && (
                  <p className={styles.email}>
                    {mentorship.menteeEmail}
                  </p>
                )}

                <div className={styles.info}>
                  <p>
                    <strong>
                      Enviado el:
                    </strong>{" "}
                    {formatDate(
                      latestEvidence.created_at,
                    )}
                  </p>

                  <p>
                    <strong>
                      Fecha de la cita:
                    </strong>{" "}
                    {formatDate(
                      mentorship
                        .startDateTime
                        ?.dateTime,
                    )}
                  </p>

                  <p>
                    <strong>
                      Evidencias:
                    </strong>{" "}
                    {evidencias.length}
                  </p>
                </div>
              </div>

              <div className={styles.actions}>
                <Link
                  className={styles.viewButton}
                  href={`/evidencias/${encodeURIComponent(
                    mentorship.id,
                  )}`}
                >
                  Ver evidencias
                </Link>
              </div>
            </article>
          );
        },
      )}
    </section>
  )}
</main>

);
}
