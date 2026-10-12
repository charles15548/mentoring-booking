"use client";

import { ChangeEvent, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { supabase } from "@/lib/supabase";
import type { Mentee } from "./page";
import "./ModalImportarMentees.css";

type Props = {
  menteesExistentes: Mentee[];
  onClose: () => void;
};

type RegistroImportado = {
  fila: number;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  resumen: string;
  errores: string[];
};

type ResultadoImportacion = {
  email: string;
  nombres: string;
  apellidos: string;
  estado: "creado" | "omitido" | "error";
  mensaje: string;
  invitacionEnviada?: boolean;
};

type RespuestaImportacion = {
  resultados?: ResultadoImportacion[];
  error?: string;
};

const COLUMNAS = [
  "nombres",
  "apellidos",
  "email",
  "telefono",
  "especialidad",
  "resumen",
];

const COLUMNAS_OBLIGATORIAS = ["nombres", "email"];
const MAX_FILAS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const TAMANO_LOTE = 5;

function normalizarCorreo(valor: string) {
  return valor.trim().toLowerCase();
}

function correoValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function normalizarColumna(valor: string) {
  return valor.trim().toLowerCase().replace(/\s+/g, "_");
}

function leerCSV(contenido: string, separador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  const texto = contenido.replace(/^\uFEFF/, "");

  for (let i = 0; i < texto.length; i++) {
    const caracter = texto[i];

    if (caracter === '"') {
      if (entreComillas && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (entreComillas || campo.length === 0) {
        entreComillas = !entreComillas;
      } else {
        throw new Error("El CSV contiene comillas fuera de un campo válido.");
      }
      continue;
    }

    if (!entreComillas && caracter === separador) {
      fila.push(campo);
      campo = "";
      continue;
    }

    if (!entreComillas && (caracter === "\n" || caracter === "\r")) {
      if (caracter === "\r" && texto[i + 1] === "\n") {
        i++;
      }

      fila.push(campo);
      if (fila.some((valor) => valor.trim() !== "")) {
        filas.push(fila);
      }

      fila = [];
      campo = "";
      continue;
    }

    campo += caracter;
  }

  if (entreComillas) {
    throw new Error("El CSV contiene comillas sin cerrar.");
  }

  fila.push(campo);

  if (fila.some((valor) => valor.trim() !== "")) {
    filas.push(fila);
  }

  return filas;
}

function detectarSeparador(contenido: string) {
  const primeraLinea = contenido.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];

  const comas = (primeraLinea.match(/,/g) ?? []).length;
  const puntosComa = (primeraLinea.match(/;/g) ?? []).length;

  return puntosComa > comas ? ";" : ",";
}

async function leerExcel(archivo: File): Promise<string[][]> {
  const filasExcel = await readSheet(archivo);

  return filasExcel
    .map((fila) =>
      fila.map((celda) => {
        if (celda === null || celda === undefined) {
          return "";
        }
        return String(celda).trim();
      }),
    )
    .filter((fila) => fila.some((valor) => valor.trim() !== ""));
}

async function leerArchivo(archivo: File): Promise<string[][]> {
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith(".xlsx")) {
    return leerExcel(archivo);
  }

  if (nombre.endsWith(".csv")) {
    const contenido = await archivo.text();
    return leerCSV(contenido, detectarSeparador(contenido));
  }

  throw new Error(
    "Formato no permitido. Selecciona un archivo CSV o Excel (.xlsx).",
  );
}

function escaparCSV(valor: string | number) {
  let texto = String(valor);

  if (/^\s*[=+\-@\t\r]/.test(texto)) {
    texto = "'" + texto;
  }

  return `"${texto.replace(/"/g, '""')}"`;
}

function descargarCSV(
  columnas: string[],
  filas: Array<Array<string | number>>,
  nombreArchivo: string,
) {
  const contenido = [
    columnas.map(escaparCSV).join(","),
    ...filas.map((fila) => fila.map(escaparCSV).join(",")),
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", contenido], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  URL.revokeObjectURL(url);
}

function descargarPlantilla() {
  descargarCSV(
    COLUMNAS,
    [
      [
        "Juan",
        "Pérez",
        "juan@ejemplo.com",
        "999888777",
        "Ingeniería de Sistemas",
        "",
      ],
      [
        "María",
        "López",
        "maria@ejemplo.com",
        "999777666",
        "Ingeniería Industrial",
        "",
      ],
    ],
    "plantilla_mentees_prouni.csv",
  );
}

export default function ModalImportarMentees({
  menteesExistentes,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState(1);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [registros, setRegistros] = useState<RegistroImportado[]>([]);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [importando, setImportando] = useState(false);
  const [procesados, setProcesados] = useState(0);
  const [resultados, setResultados] = useState<ResultadoImportacion[]>([]);
  const [errorImportacion, setErrorImportacion] = useState("");

  const registrosValidos = registros.filter(
    (registro) => registro.errores.length === 0,
  );

  const registrosConError = registros.filter(
    (registro) => registro.errores.length > 0,
  );

  const resultadosCreados = resultados.filter(
    (resultado) => resultado.estado === "creado",
  );

  const resultadosOmitidos = resultados.filter(
    (resultado) => resultado.estado === "omitido",
  );

  const resultadosError = resultados.filter(
    (resultado) => resultado.estado === "error",
  );

  const registrosFiltrados = registros.filter((registro) => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) return true;

    return (
      registro.nombres.toLowerCase().includes(termino) ||
      registro.apellidos.toLowerCase().includes(termino) ||
      registro.email.toLowerCase().includes(termino)
    );
  });

  const correosExistentes = new Set(
    menteesExistentes.map((mentee) => normalizarCorreo(mentee.email)),
  );

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No existe una sesión activa. Inicia sesión nuevamente.");
    }

    return session.access_token;
  }

  function limpiarArchivo() {
    if (importando) return;

    setArchivoNombre("");
    setRegistros([]);
    setErrorArchivo("");
    setBusqueda("");
    setResultados([]);
    setProcesados(0);
    setErrorImportacion("");
    setPaso(1);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function validarFilas(filas: string[][]): RegistroImportado[] {
    if (filas.length < 2) {
      throw new Error(
        "El archivo debe contener encabezados y al menos un estudiante.",
      );
    }

    const encabezados = filas[0].map(normalizarColumna);

    const duplicados = encabezados.filter(
      (columna, indice) => encabezados.indexOf(columna) !== indice,
    );

    if (duplicados.length > 0) {
      throw new Error(
        "El archivo contiene columnas repetidas: " +
          [...new Set(duplicados)].join(", "),
      );
    }

    const faltantes = COLUMNAS_OBLIGATORIAS.filter(
      (columna) => !encabezados.includes(columna),
    );

    if (faltantes.length > 0) {
      throw new Error("Faltan columnas obligatorias: " + faltantes.join(", "));
    }

    const filasDatos = filas.slice(1);

    if (filasDatos.length > MAX_FILAS) {
      throw new Error(`El archivo supera el máximo de ${MAX_FILAS} registros.`);
    }

    const correosDelArchivo = new Set<string>();

    return filasDatos.map((valores, indice) => {
      const errores: string[] = [];

      if (valores.length !== encabezados.length) {
        errores.push(
          "La cantidad de columnas no coincide con los encabezados.",
        );
      }

      function obtener(columna: string) {
        const posicion = encabezados.indexOf(columna);

        if (posicion === -1) return "";

        return (valores[posicion] ?? "").trim();
      }

      const nombres = obtener("nombres");
      const apellidos = obtener("apellidos");
      const email = normalizarCorreo(obtener("email"));
      const telefono = obtener("telefono");
      const especialidad = obtener("especialidad");
      const resumen = obtener("resumen");

      if (!nombres) {
        errores.push("El nombre es obligatorio.");
      }

      if (!email) {
        errores.push("El correo es obligatorio.");
      } else if (!correoValido(email)) {
        errores.push("Correo inválido.");
      } else {
        if (correosDelArchivo.has(email)) {
          errores.push("Correo duplicado en el archivo.");
        }

        if (correosExistentes.has(email)) {
          errores.push("El correo ya figura en Gestión de Mentees.");
        }

        correosDelArchivo.add(email);
      }

      return {
        fila: indice + 2,
        nombres,
        apellidos,
        email,
        telefono,
        especialidad,
        resumen,
        errores,
      };
    });
  }

  async function seleccionarArchivo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];

    if (!archivo) return;

    setLeyendo(true);
    setErrorArchivo("");
    setRegistros([]);
    setArchivoNombre("");

    try {
      const nombre = archivo.name.toLowerCase();

      if (!nombre.endsWith(".csv") && !nombre.endsWith(".xlsx")) {
        throw new Error("Solo se permiten archivos CSV y Excel (.xlsx).");
      }

      if (archivo.size > MAX_BYTES) {
        throw new Error("El archivo supera el tamaño máximo de 2 MB.");
      }

      const filas = await leerArchivo(archivo);
      const registrosLeidos = validarFilas(filas);

      setRegistros(registrosLeidos);
      setArchivoNombre(archivo.name);
      setBusqueda("");
      setPaso(2);
    } catch (error) {
      setErrorArchivo(
        error instanceof Error ? error.message : "No se pudo leer el archivo.",
      );
    } finally {
      setLeyendo(false);
    }
  }

  function descargarErroresValidacion() {
    descargarCSV(
      ["fila", "nombres", "apellidos", "email", "errores"],
      registrosConError.map((registro) => [
        registro.fila,
        registro.nombres,
        registro.apellidos,
        registro.email,
        registro.errores.join(" | "),
      ]),
      "errores_validacion_mentees.csv",
    );
  }

  async function confirmarImportacion() {
    if (importando || registrosValidos.length === 0) {
      return;
    }

    setImportando(true);
    setErrorImportacion("");
    setResultados([]);
    setProcesados(0);
    setPaso(3);

    const acumulados: ResultadoImportacion[] = [];

    try {
      for (
        let indice = 0;
        indice < registrosValidos.length;
        indice += TAMANO_LOTE
      ) {
        const lote = registrosValidos.slice(indice, indice + TAMANO_LOTE);

        const token = await getToken();

        const response = await fetch(
          "/api/coordinador/gestionMentees/importar",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              mentees: lote.map((registro) => ({
                nombres: registro.nombres,
                apellidos: registro.apellidos,
                email: registro.email,
                telefono: registro.telefono,
                especialidad: registro.especialidad,
                resumen: registro.resumen,
              })),
            }),
          },
        );

        const data: RespuestaImportacion = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "No se pudo procesar el lote de estudiantes.",
          );
        }

        if (
          !Array.isArray(data.resultados) ||
          data.resultados.length !== lote.length
        ) {
          throw new Error(
            "El servidor devolvió resultados incompletos. Revisa las cuentas antes de reintentar.",
          );
        }

        acumulados.push(...data.resultados);
        setResultados([...acumulados]);
        setProcesados(acumulados.length);
      }
    } catch (error) {
      setErrorImportacion(
        error instanceof Error
          ? error.message
          : "Se interrumpió la importación.",
      );
    } finally {
      setImportando(false);
    }
  }

  function cerrarModal() {
    if (importando) return;
    onClose();
  }

  return (
    <div className="importar-mentees-backdrop">
      <section
        className="importar-mentees-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="importar-mentees-titulo"
      >
        <header className="importar-mentees-header">
          <div>
            <p className="importar-mentees-eyebrow">GESTIÓN DE MENTEES</p>
            <h2 id="importar-mentees-titulo">Importar mentees</h2>
          </div>

          <button
            type="button"
            className="importar-mentees-close"
            onClick={cerrarModal}
            disabled={importando}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </header>

        <div
          className="importar-mentees-steps"
          aria-label={`Paso ${paso} de 3`}
        >
          <div className={`importar-mentees-step ${paso >= 1 ? "active" : ""}`}>
            <span>1</span>
            <p>Cargar archivo</p>
          </div>

          <div
            className={`importar-mentees-step-line ${
              paso >= 2 ? "active" : ""
            }`}
          />

          <div className={`importar-mentees-step ${paso >= 2 ? "active" : ""}`}>
            <span>2</span>
            <p>Validar</p>
          </div>

          <div
            className={`importar-mentees-step-line ${
              paso >= 3 ? "active" : ""
            }`}
          />

          <div className={`importar-mentees-step ${paso >= 3 ? "active" : ""}`}>
            <span>3</span>
            <p>Resultados</p>
          </div>
        </div>

        <div className="importar-mentees-body">
          {/* PASO 1: CARGAR ARCHIVO */}
          {paso === 1 && (
            <>
              <div className="importar-mentees-section-header">
                <div>
                  <h3>Selecciona el archivo</h3>
                  <p>
                    Carga un archivo CSV o Excel con la información de los
                    estudiantes que deseas registrar.
                  </p>
                </div>

                <span className="importar-mentees-count">
                  Máximo {MAX_FILAS} registros
                </span>
              </div>

              <div className="importar-mentees-upload">
                <div className="importar-mentees-upload-icon">↑</div>
                <strong>Seleccionar archivo CSV o Excel</strong>
                <p>Formatos .csv y .xlsx · Máximo 2 MB</p>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={seleccionarArchivo}
                  disabled={leyendo}
                  aria-label="Seleccionar archivo CSV o Excel"
                />
              </div>

              <button
                type="button"
                className="importar-mentees-link"
                onClick={descargarPlantilla}
              >
                Descargar plantilla CSV
              </button>

              <div className="importar-mentees-note">
                Puedes abrir la plantilla en Excel y guardar el archivo como
                .xlsx o .csv. No incluyas contraseñas en el archivo.
              </div>

              {leyendo && <p role="status">Leyendo y validando archivo...</p>}

              {errorArchivo && (
                <div className="importar-mentees-error" role="alert">
                  {errorArchivo}
                </div>
              )}
            </>
          )}

          {/* PASO 2: VALIDAR */}
          {paso === 2 && (
            <>
              <div className="importar-mentees-section-header">
                <div>
                  <h3>Validar estudiantes</h3>
                  <p>Revisa los datos antes de confirmar la importación.</p>
                </div>

                <span className="importar-mentees-count">
                  {registros.length} registros
                </span>
              </div>

              <div className="importar-mentees-file-info">
                <span>Archivo seleccionado</span>
                <strong>{archivoNombre}</strong>
              </div>

              <div className="importar-mentees-stats">
                <div>
                  <strong>{registros.length}</strong>
                  <span>Leídos</span>
                </div>
                <div>
                  <strong>{registrosValidos.length}</strong>
                  <span>Válidos</span>
                </div>
                <div>
                  <strong>{registrosConError.length}</strong>
                  <span>Con errores</span>
                </div>
              </div>

              <input
                type="search"
                className="importar-mentees-search"
                placeholder="Buscar estudiante o correo..."
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
              />

              <div className="importar-mentees-table-wrap">
                <table className="importar-mentees-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estudiante</th>
                      <th>Correo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.map((registro) => (
                      <tr key={registro.fila}>
                        <td>{registro.fila}</td>
                        <td>
                          <strong>
                            {[registro.nombres, registro.apellidos]
                              .filter(Boolean)
                              .join(" ") || "Sin nombre"}
                          </strong>
                        </td>
                        <td>{registro.email || "—"}</td>
                        <td>
                          {registro.errores.length === 0 ? (
                            <span className="importar-mentees-status-ok">
                              ✓ Válido
                            </span>
                          ) : (
                            <div className="importar-mentees-row-errors">
                              {registro.errores.map((mensaje, indice) => (
                                <span key={indice}>{mensaje}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}

                    {registrosFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={4} className="importar-mentees-no-results">
                          No se encontraron registros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {registrosConError.length > 0 && (
                <button
                  type="button"
                  className="importar-mentees-link"
                  onClick={descargarErroresValidacion}
                >
                  Descargar errores de validación
                </button>
              )}

              <div className="importar-mentees-note">
                Solo se enviarán los{" "}
                <strong>{registrosValidos.length} registros válidos</strong>.
                Los estudiantes con errores no serán registrados.
              </div>
            </>
          )}

          {/* PASO 3: RESULTADOS */}
          {paso === 3 && (
            <>
              <div className="importar-mentees-section-header">
                <div>
                  <h3>
                    {importando
                      ? "Importando estudiantes..."
                      : "Resultados de importación"}
                  </h3>
                  <p>
                    {importando
                      ? "Espera mientras se registran las cuentas."
                      : "Revisa las operaciones realizadas."}
                  </p>
                </div>

                <span className="importar-mentees-count">
                  {procesados} / {registrosValidos.length}
                </span>
              </div>

              {errorImportacion && (
                <div className="importar-mentees-error" role="alert">
                  {errorImportacion}
                </div>
              )}

              <div className="importar-mentees-stats">
                <div>
                  <strong>{resultadosCreados.length}</strong>
                  <span>Creados</span>
                </div>
                <div>
                  <strong>{resultadosOmitidos.length}</strong>
                  <span>Omitidos</span>
                </div>
                <div>
                  <strong>{resultadosError.length}</strong>
                  <span>Errores</span>
                </div>
              </div>

              {resultados.length > 0 && (
                <div
                  className="importar-mentees-table-wrap"
                  style={{ marginTop: "20px" }}
                >
                  <table className="importar-mentees-table">
                    <thead>
                      <tr>
                        <th>Estudiante</th>
                        <th>Correo</th>
                        <th>Estado</th>
                        <th>Correo de activación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((resultado, indice) => (
                        <tr key={`${resultado.email}-${indice}`}>
                          <td>
                            <strong>
                              {[resultado.nombres, resultado.apellidos]
                                .filter(Boolean)
                                .join(" ")}
                            </strong>
                          </td>

                          <td title={resultado.mensaje}>{resultado.email}</td>

                          <td>
                            {resultado.estado === "creado" ? (
                              <span className="importar-mentees-status-ok">
                                ✓ Creado
                              </span>
                            ) : resultado.estado === "omitido" ? (
                              "Omitido"
                            ) : (
                              <span
                                title={resultado.mensaje}
                                style={{
                                  color: "#b42318",
                                }}
                              >
                                {resultado.mensaje}
                              </span>
                            )}
                          </td>

                          <td title={resultado.mensaje}>
                            {resultado.estado === "creado"
                              ? resultado.invitacionEnviada
                                ? "Invitación enviada"
                                : "Envío pendiente"
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="importar-mentees-note">
                Los participantes recibirán un enlace para establecer su
                contraseña. Si alguno no recibe el correo, podrás reenviar el
                enlace desde Gestión de mentees.
              </div>
            </>
          )}

          {/* BOTONES INFERIORES */}
          <div
            className="importar-mentees-actions"
            style={{
              marginTop: "24px",
              paddingTop: "24px",
              paddingBottom: "10px",
              paddingLeft: "12px",
              paddingRight: "12px",
              gap: "18px",
              justifyContent: paso === 3 ? "flex-end" : "space-between",
            }}
          >
            {paso === 1 && (
              <>
                <button
                  type="button"
                  className="importar-mentees-secondary"
                  onClick={cerrarModal}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="importar-mentees-primary"
                  disabled
                >
                  Continuar
                </button>
              </>
            )}

            {paso === 2 && (
              <>
                <button
                  type="button"
                  className="importar-mentees-secondary"
                  onClick={limpiarArchivo}
                >
                  Atrás
                </button>

                <button
                  type="button"
                  className="importar-mentees-primary"
                  disabled={registrosValidos.length === 0 || importando}
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Confirmas importar ${registrosValidos.length} mentees?`,
                      )
                    ) {
                      void confirmarImportacion();
                    }
                  }}
                >
                  Importar {registrosValidos.length} mentees
                </button>
              </>
            )}

            {paso === 3 && (
              <button
                type="button"
                className="importar-mentees-primary"
                disabled={importando}
                onClick={cerrarModal}
              >
                Finalizar
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
