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
};

const labels: Record<Agreement["estado"], string> = {
pendiente: "Pendiente",
en_progreso: "En progreso",
cumplido: "Cumplido",
cancelado: "Cancelado",
};

export default function MenteeAgreements({
bookingId,
}: {
bookingId: string;
}) {
const [items, setItems] = useState<Agreement[]>([]);
const [evidencias, setEvidencias] = useState<Record<string, Evidence[]>>(
{},
);
const [selectedFiles, setSelectedFiles] = useState<
Record<string, File | null>

> ({});
 const [uploading, setUploading] = useState<Record<string, boolean>>({});
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(true);

async function call(path: string, init?: RequestInit) {
const {
data: { session },
} = await supabase.auth.getSession();


if (!session?.access_token) {
  throw new Error("No se encontró la sesión activa.");
}

const isFormData = init?.body instanceof FormData;

const response = await fetch(path, {
  ...init,
  headers: {
    ...(isFormData
      ? {}
      : { "Content-Type": "application/json" }),
    Authorization: `Bearer ${session.access_token}`,
    ...init?.headers,
  },
});

const data = await response.json();

if (!response.ok) {
  throw new Error(
    data.error || "No se pudo completar la operación.",
  );
}

return data;


}

async function loadEvidence(agreementId: string) {
try {
const data = await call(
`/api/mentee/evidencias?acuerdoId=${encodeURIComponent(
          agreementId,
        )}`,
);


  setEvidencias((current) => ({
    ...current,
    [agreementId]: data,
  }));
} catch (loadError) {
  console.error("Error cargando evidencias:", loadError);
}


}

useEffect(() => {
void (async () => {
try {
const agreements = await call(
`/api/mentee/acuerdos?bookingId=${encodeURIComponent(
            bookingId,
          )}`,
);


    setItems(agreements);

    await Promise.all(
      agreements.map((agreement: Agreement) =>
        loadEvidence(agreement.id),
      ),
    );
  } catch (loadError) {
    setError(
      loadError instanceof Error
        ? loadError.message
        : "No se pudieron cargar los acuerdos.",
    );
  } finally {
    setLoading(false);
  }
})();


}, [bookingId]);

async function changeStatus(
id: string,
estado: Agreement["estado"],
) {
try {
setError("");


  const updated = await call("/api/mentee/acuerdos", {
    method: "PATCH",
    body: JSON.stringify({
      id,
      estado,
    }),
  });

  setItems((current) =>
    current.map((item) =>
      item.id === id ? updated : item,
    ),
  );
} catch (updateError) {
  setError(
    updateError instanceof Error
      ? updateError.message
      : "No se pudo actualizar el estado.",
  );
}

}

function selectFile(
agreementId: string,
file: File | null,
) {
setSelectedFiles((current) => ({
...current,
[agreementId]: file,
}));
}

async function uploadEvidence(agreementId: string) {
const file = selectedFiles[agreementId];


if (!file) {
  setError("Selecciona un archivo antes de subirlo.");
  return;
}

try {
  setError("");

  setUploading((current) => ({
    ...current,
    [agreementId]: true,
  }));

  const formData = new FormData();

  formData.append("acuerdoId", agreementId);
  formData.append("file", file);

  await call("/api/mentee/evidencias", {
    method: "POST",
    body: formData,
  });

  setSelectedFiles((current) => ({
    ...current,
    [agreementId]: null,
  }));

  await loadEvidence(agreementId);
} catch (uploadError) {
  setError(
    uploadError instanceof Error
      ? uploadError.message
      : "No se pudo subir la evidencia.",
  );
} finally {
  setUploading((current) => ({
    ...current,
    [agreementId]: false,
  }));
}

}

function getEvidenceUrl(path: string) {
return supabase.storage
.from("bucket")
.getPublicUrl(path).data.publicUrl;
}

return ( <main className="page-content"> <section className="welcome-row"> <div> <p className="eyebrow">MENTORÍA REALIZADA</p>

```
      <h1>Mis acuerdos</h1>

      <p className="intro">
        Revisa los compromisos definidos con tu mentor y
        actualiza tu avance.
      </p>
    </div>
  </section>

  <Link
    className={styles.backLink}
    href="/mentoriasMentee"
  >
    ← Volver a Repositorio de Mentorías
  </Link>

  {error && (
    <p className="form-error">
      {error}
    </p>
  )}

  {loading ? (
    <div className="empty-state">
      <h2>Cargando acuerdos...</h2>
    </div>
  ) : items.length === 0 ? (
    <div className="empty-state">
      <h2>No hay acuerdos registrados</h2>

      <p>
        Tu mentor aún no ha registrado acuerdos para esta
        sesión.
      </p>
    </div>
  ) : (
    <section className="reservation-list">
      {items.map((item) => {
        const agreementEvidence =
          evidencias[item.id] ?? [];

        const selectedFile =
          selectedFiles[item.id] ?? null;

        const isUploading =
          uploading[item.id] ?? false;

        return (
          <article
            className="reservation-card"
            key={item.id}
          >
            <div>
              <p className="eyebrow">
                {labels[item.estado]}
              </p>

              <h2>{item.titulo}</h2>

              {item.descripcion && (
                <p>{item.descripcion}</p>
              )}

              {item.observacion && (
                <p>
                  <strong>Observación:</strong>{" "}
                  {item.observacion}
                </p>
              )}

              {item.fecha_limite && (
                <p>
                  <strong>Fecha límite:</strong>{" "}
                  {new Date(
                    `${item.fecha_limite}T00:00:00`,
                  ).toLocaleDateString("es-PE")}
                </p>
              )}
            </div>

            <label className={styles.statusControl}>
              Mi avance

              <select
                value={item.estado}
                onChange={(event) =>
                  changeStatus(
                    item.id,
                    event.target
                      .value as Agreement["estado"],
                  )
                }
              >
                {Object.entries(labels).map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <div className={styles.evidenceSection}>
              <h3>Evidencia de avance</h3>

              <p>
                Sube un archivo que demuestre el
                avance de este acuerdo.
              </p>

              <input
                className={styles.fileInput}
                type="file"
                onChange={(event) =>
                  selectFile(
                    item.id,
                    event.target.files?.[0] ?? null,
                  )
                }
                disabled={isUploading}
              />

              {selectedFile && (
                <div className={styles.selectedFile}>
                  <span
                    className={styles.selectedFileIcon}
                  >
                    📄
                  </span>

                  <span
                    className={styles.selectedFileName}
                    title={selectedFile.name}
                  >
                    {selectedFile.name}
                  </span>
                </div>
              )}

              <button
                className={styles.uploadButton}
                type="button"
                onClick={() =>
                  uploadEvidence(item.id)
                }
                disabled={
                  !selectedFile || isUploading
                }
              >
                {isUploading
                  ? "Subiendo..."
                  : "Subir evidencia"}
              </button>

              {agreementEvidence.length > 0 && (
                <div className={styles.evidenceList}>
                  <h4>Evidencias enviadas</h4>

                  {agreementEvidence.map(
                    (evidence) => (
                      <div
                        className={styles.evidenceItem}
                        key={evidence.id}
                      >
                        <div
                          className={
                            styles.evidenceFile
                          }
                        >
                          <span>📎</span>

                          <span
                            className={
                              styles.evidenceFileName
                            }
                            title={
                              evidence.nombre_archivo
                            }
                          >
                            {evidence.nombre_archivo}
                          </span>
                        </div>

                        <a
                          className={
                            styles.viewEvidenceButton
                          }
                          href={getEvidenceUrl(
                            evidence.ruta_archivo,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver archivo
                        </a>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </section>
  )}
</main>


);
}
