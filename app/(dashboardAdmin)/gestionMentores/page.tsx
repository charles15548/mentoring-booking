
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import ModalGestionMentores from "./ModalGestionMentores";
import ModalDetallesMentor from "./ModalDetallesMentor";
import ModalImportarMentores from "./ModalImportarMentores";

export type Mentor = {
  id: string;
  staffId: string;
  profileId: string | null;

  businessId?: string;
  businessName?: string;

  name: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  foto_url: string;
  resumen: string;

  activo: boolean;
  role?: string;
  tieneCuenta: boolean;
};

export type MentorFormData = {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  foto_url: string;
  resumen: string;
  activo: boolean;
};

type RespuestaGuardarMentor = {
  message?: string;
  error?: string;
  invitacionEnviada?: boolean;
};

type RespuestaReenvio = {
  message?: string;
  error?: string;
  email?: string;
};

export default function GestionMentoresPage() {
  const [mentores, setMentores] = useState<Mentor[]>([]);

  const [modalOpen, setModalOpen] = useState(false);

  const [modalImportarOpen, setModalImportarOpen] =
    useState(false);

  const [mentorEditar, setMentorEditar] =
    useState<Mentor | null>(null);

  const [mentorDetalles, setMentorDetalles] =
    useState<Mentor | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  // Mentor al que se está reenviando un enlace.
  const [reenviandoId, setReenviandoId] =
    useState<string | null>(null);

  /* ================================================
     TOKEN SUPABASE
  ================================================ */

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error(
        "No existe una sesión activa.",
      );
    }

    return session.access_token;
  }

  /* ================================================
     LEER RESPUESTAS DE LA API
  ================================================ */

  async function readResponse(response: Response) {
    const contentType =
      response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();

      console.error("Respuesta no JSON:", text);

      throw new Error(
        `La API no devolvió JSON. Código HTTP: ${response.status}`,
      );
    }

    return response.json();
  }

  /* ================================================
     CARGAR MENTORES
  ================================================ */

  async function cargarMentores() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const token = await getToken();

      const response = await fetch(
        "/api/coordinador/gestionMentores",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron obtener los mentores.",
        );
      }

      setMentores(data);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los mentores.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void cargarMentores();
  }, []);

  /* ================================================
     NUEVO MENTOR
  ================================================ */

  function nuevoMentor() {
    setMentorEditar(null);
    setModalOpen(true);
  }

  /* ================================================
     IMPORTAR MENTORES
  ================================================ */

  function abrirModalImportar() {
    setModalImportarOpen(true);
  }

  function cerrarModalImportar() {
    setModalImportarOpen(false);

    void cargarMentores();
  }

  /* ================================================
     EDITAR MENTOR
  ================================================ */

  function editarMentor(mentor: Mentor) {
    setMentorEditar(mentor);
    setModalOpen(true);
  }

  /* ================================================
     CERRAR MODAL
  ================================================ */

  function cerrarModal() {
    setModalOpen(false);
    setMentorEditar(null);
  }

  /* ================================================
     GUARDAR MENTOR

     POST: registro y correo de activación.
     PUT: actualizar mentor.
  ================================================ */

  async function guardarMentor(
    formData: MentorFormData,
  ): Promise<string> {
    const token = await getToken();

    const editando = Boolean(mentorEditar);

    const payload = editando
      ? {
          ...formData,
          id: mentorEditar!.id,
          staffId: mentorEditar!.staffId,
          profileId: mentorEditar!.profileId,
        }
      : formData;

    const response = await fetch(
      "/api/coordinador/gestionMentores",
      {
        method: editando ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );

    const data: RespuestaGuardarMentor =
      await readResponse(response);

    if (!response.ok) {
      throw new Error(
        data.error ||
          "No se pudo guardar el mentor.",
      );
    }

    await cargarMentores();

    if (editando) {
      return "Los cambios del mentor se guardaron correctamente.";
    }

    if (data.invitacionEnviada === true) {
      return (
        "Mentor registrado correctamente. " +
        "Se solicitó el envío de su correo de activación."
      );
    }

    return (
      "Mentor registrado correctamente, pero el correo " +
      "de activación quedó pendiente de envío."
    );
  }

  /* ================================================
     REENVIAR ENLACE DE ACTIVACIÓN O RECUPERACIÓN
  ================================================ */

  async function reenviarEnlace(mentor: Mentor) {
    if (!mentor.profileId || !mentor.tieneCuenta) {
      window.alert(
        "Este mentor no tiene una cuenta vinculada en Supabase.",
      );
      return;
    }

    if (!mentor.activo) {
      window.alert(
        "El mentor está inactivo. Debes activar su cuenta antes de reenviar el enlace.",
      );
      return;
    }

    if (reenviandoId !== null) {
      return;
    }

    try {
      setReenviandoId(mentor.profileId);

      const token = await getToken();

      const response = await fetch(
        "/api/coordinador/gestionMentores/reenviar-activacion",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profileId: mentor.profileId,
            staffId: mentor.staffId,
          }),
        },
      );

      const data: RespuestaReenvio =
        await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo solicitar el reenvío del enlace.",
        );
      }

      window.alert(
        data.message ||
          "Se solicitó el envío del enlace al correo del mentor.",
      );
    } catch (error) {
      console.error(
        "[gestion-mentores] Error al reenviar:",
        error,
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al reenviar el enlace.",
      );
    } finally {
      setReenviandoId(null);
    }
  }

  /* ================================================
     ELIMINAR MENTOR
     NOTA: EL DELETE DE LA API SE CORREGIRÁ
     PARA PROTEGER EL HISTORIAL.
  ================================================ */

  async function eliminarMentor(mentor: Mentor) {
    if (
      !window.confirm(
        `¿Seguro que deseas eliminar a ${mentor.name}?`,
      )
    ) {
      return;
    }

    try {
      const token = await getToken();

      const response = await fetch(
        "/api/coordinador/gestionMentores",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            staffId: mentor.staffId,
            profileId: mentor.profileId,
          }),
        },
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo eliminar el mentor.",
        );
      }

      await cargarMentores();

      window.alert(
        "Mentor eliminado correctamente.",
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el mentor.",
      );
    }
  }

  /* ================================================
     INTERFAZ
  ================================================ */

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">
            COORDINACIÓN · PROUNI
          </p>

          <h1>Gestión de mentores</h1>

          <p className="intro">
            Administra a las personas que brindan mentoría.
            <br />
            Aquí puedes registrar nuevos mentores,
            consultar sus datos, editar sus perfiles
            o eliminarlos.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={nuevoMentor}
        >
          + Nuevo mentor
        </button>

        <button
          className="primary-button"
          onClick={abrirModalImportar}
          style={{
            position: "relative",
            top: "55px",
          }}
        >
          Importar CSV
        </button>
      </section>

      {errorMessage && (
        <p className="form-error">
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <section className="empty-state">
          <h2>Cargando mentores...</h2>
        </section>
      ) : mentores.length === 0 ? (
        <section className="empty-state">
          <h2>
            No hay mentores en Microsoft Bookings
          </h2>

          <p>
            Agrega personal al Booking Agendar mentorías.
          </p>
        </section>
      ) : (
        <section className="mentor-management-list">
          {mentores.map((mentor) => (
            <article
              key={mentor.staffId}
              className="mentor-management-card"
            >
              <div className="mentor-management-identity">
                {mentor.foto_url ? (
                  <img
                    src={mentor.foto_url}
                    alt={`Foto de ${mentor.name}`}
                    className="mentor-management-avatar"
                    width={68}
                    height={68}
                  />
                ) : (
                  <div className="mentor-management-avatar mentor-management-avatar-placeholder">
                    {mentor.nombres
                      ?.charAt(0)
                      ?.toUpperCase() || "M"}
                  </div>
                )}

                <div className="mentor-management-info">
                  <strong>{mentor.name}</strong>

                  <p>{mentor.email}</p>

                  <small>
                    {mentor.telefono || "Sin teléfono"}
                    {" "}
                    <span className="mentor-management-separator">
                      |
                    </span>
                    {" "}
                    {mentor.especialidad ||
                      "Sin especialidad"}
                  </small>
                </div>
              </div>

              <div className="mentor-management-actions">
                <span>
                  {mentor.tieneCuenta
                    ? mentor.activo
                      ? "Cuenta vinculada"
                      : "Cuenta inactiva"
                    : "Solo Bookings"}
                </span>

                {/* REENVIAR ENLACE */}
                {mentor.tieneCuenta &&
                  mentor.profileId &&
                  mentor.activo && (
                    <button
                      type="button"
                      onClick={() =>
                        void reenviarEnlace(mentor)
                      }
                      disabled={reenviandoId !== null}
                    >
                      {reenviandoId === mentor.profileId
                        ? "Enviando..."
                        : "Reenviar enlace"}
                    </button>
                  )}

                <button
                  onClick={() =>
                    setMentorDetalles(mentor)
                  }
                >
                  Detalles
                </button>

                <button
                  onClick={() =>
                    editarMentor(mentor)
                  }
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    void eliminarMentor(mentor)
                  }
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modalOpen && (
        <ModalGestionMentores
          mentor={mentorEditar}
          onClose={cerrarModal}
          onSave={guardarMentor}
        />
      )}

      {mentorDetalles && (
        <ModalDetallesMentor
          mentor={mentorDetalles}
          onClose={() =>
            setMentorDetalles(null)
          }
        />
      )}

      {modalImportarOpen && (
        <ModalImportarMentores
          mentoresExistentes={mentores}
          onClose={cerrarModalImportar}
        />
      )}
    </div>
  );
}
