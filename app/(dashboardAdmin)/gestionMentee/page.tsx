"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import ModalGestionMentee from "./ModalGestionMentee";
import ModalImportarMentees from "./ModalImportarMentees";
import ModalDetallesMentee from "./ModalDetallesMentee";

export type Mentee = {
  id: string;
  customerId: string;
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
  tieneCuenta: boolean;
};

export type MenteeFormData = {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  foto_url: string;
  resumen: string;
  activo: boolean;
  password?: string;
};

export default function GestionMenteePage() {
  const [mentees, setMentees] = useState<Mentee[]>([]);

  const [modalOpen, setModalOpen] = useState(false);

  const [modalImportarOpen, setModalImportarOpen] = useState(false);

  const [modalDetallesOpen, setModalDetallesOpen] = useState(false);

  const [menteeEditar, setMenteeEditar] = useState<Mentee | null>(null);

  const [menteeDetalles, setMenteeDetalles] = useState<Mentee | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  /* ======================================================
     TOKEN SUPABASE
  ====================================================== */

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No existe una sesión activa.");
    }

    return session.access_token;
  }

  /* ======================================================
     CARGAR MENTEES

     La lista principal viene de los customers de Bookings.
  ====================================================== */

  async function cargarMentees() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const token = await getToken();

      const response = await fetch("/api/coordinador/gestionMentees", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron obtener los mentees.");
      }

      setMentees(data);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los mentees.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void cargarMentees();
  }, []);

  /* ======================================================
     NUEVO
  ====================================================== */

  function nuevoMentee() {
    setMenteeEditar(null);
    setModalOpen(true);
  }

  /* ======================================================
     IMPORTAR
  ====================================================== */

  function abrirModalImportar() {
    setModalImportarOpen(true);
  }

  function cerrarModalImportar() {
    setModalImportarOpen(false);

    /*
      Al cerrar la importación, se vuelve a consultar
      la lista para mostrar las cuentas recién creadas.

      No recargamos la página completa.
    */
    void cargarMentees();
  }

  /* ======================================================
     DETALLES
  ====================================================== */

  function abrirDetallesMentee(mentee: Mentee) {
    setMenteeDetalles(mentee);
    setModalDetallesOpen(true);
  }

  function cerrarDetallesMentee() {
    setModalDetallesOpen(false);
    setMenteeDetalles(null);
  }

  /* ======================================================
     EDITAR
  ====================================================== */

  function editarMentee(mentee: Mentee) {
    setMenteeEditar(mentee);
    setModalOpen(true);
  }

  /* ======================================================
     CERRAR MODAL
  ====================================================== */

  function cerrarModal() {
    setModalOpen(false);
    setMenteeEditar(null);
  }

  /* ======================================================
     GUARDAR
  ====================================================== */

  async function guardarMentee(formData: MenteeFormData) {
    const token = await getToken();

    const editando = Boolean(menteeEditar);

    const payload = editando
      ? {
          ...formData,
          id: menteeEditar!.id,
          customerId: menteeEditar!.customerId,
          profileId: menteeEditar!.profileId,
        }
      : formData;

    const response = await fetch("/api/coordinador/gestionMentees", {
      method: editando ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo guardar el mentee.");
    }

    await cargarMentees();

    if (editando) {
      return "Los cambios del mentee se guardaron correctamente.";
    }

    return data.invitacionEnviada
      ? "Mentee registrado. Se solicitó el envío del correo de activación."
      : "Mentee registrado correctamente, pero el correo de activación está pendiente de envío.";
  }

  async function reenviarActivacion(mentee: Mentee) {
    if (!mentee.profileId) {
      window.alert("Este mentee no tiene una cuenta vinculada en Supabase.");
      return;
    }

    const confirmar = window.confirm(
      `¿Deseas enviar un nuevo enlace para establecer la contraseña de ${mentee.name}?\n\nCorreo: ${mentee.email}`,
    );

    if (!confirmar) return;

    try {
      const token = await getToken();

      const response = await fetch(
        "/api/coordinador/gestionMentees/reenviar-activacion",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profileId: mentee.profileId,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo reenviar el enlace.");
      }

      window.alert(
        `Se solicitó el envío de un nuevo enlace a ${mentee.email}.\n\nRevisa la bandeja de entrada y Spam.`,
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al reenviar el enlace.",
      );
    }
  }

  /* ======================================================
     ELIMINAR
  ====================================================== */

  async function eliminarMentee(mentee: Mentee) {
    const confirmar = window.confirm(
      `¿Seguro que deseas eliminar a ${mentee.name}?`,
    );

    if (!confirmar) return;

    try {
      const token = await getToken();

      const response = await fetch("/api/coordinador/gestionMentees", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: mentee.customerId,
          profileId: mentee.profileId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el mentee.");
      }

      await cargarMentees();

      window.alert("Mentee eliminado correctamente.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el mentee.",
      );
    }
  }

  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">COORDINACIÓN · PROUNI</p>

          <h1>Gestión de mentees</h1>

          <p className="intro">
            Administra a las personas que reciben mentoría.
            <br />
            Aquí puedes registrar nuevos mentees, consultar sus datos, editar
            sus perfiles o eliminarlos.
          </p>
        </div>

        <button className="primary-button" onClick={nuevoMentee}>
          + Nuevo mentee
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

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      {isLoading ? (
        <section className="empty-state">
          <h2>Cargando mentees...</h2>
        </section>
      ) : mentees.length === 0 ? (
        <section className="empty-state">
          <h2>No hay mentees en Microsoft Bookings</h2>

          <p>Registra al primer participante que recibirá mentorías.</p>
        </section>
      ) : (
        <section className="mentor-management-list">
          {mentees.map((mentee) => (
            <article key={mentee.customerId} className="mentor-management-card">
              <div className="mentor-management-identity">
                {mentee.foto_url ? (
                  <img
                    src={mentee.foto_url}
                    alt={`Foto de ${mentee.name}`}
                    className="mentor-management-avatar"
                    width={68}
                    height={68}
                  />
                ) : (
                  <div className="mentor-management-avatar mentor-management-avatar-placeholder">
                    {mentee.nombres?.charAt(0)?.toUpperCase() || "M"}
                  </div>
                )}

                <div className="mentor-management-info">
                  <strong>{mentee.name}</strong>

                  <p>{mentee.email}</p>

                  <small>
                    {mentee.telefono || "Sin teléfono"}{" "}
                    <span className="mentor-management-separator">|</span>{" "}
                    {mentee.especialidad || "Sin especialidad"}
                  </small>
                </div>
              </div>

              <div className="mentor-management-actions">
                <span>
                  {mentee.tieneCuenta
                    ? mentee.activo
                      ? "Cuenta vinculada"
                      : "Cuenta inactiva"
                    : "Solo Bookings"}
                </span>

                {mentee.tieneCuenta && mentee.activo && (
                  <button
                    type="button"
                    onClick={() => void reenviarActivacion(mentee)}
                    title="Enviar un nuevo enlace para establecer la contraseña"
                  >
                    Reenviar enlace
                  </button>
                )}

                <button onClick={() => abrirDetallesMentee(mentee)}>
                  Detalles
                </button>

                <button onClick={() => editarMentee(mentee)}>Editar</button>

                <button onClick={() => void eliminarMentee(mentee)}>
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* MODAL CREAR / EDITAR */}

      {modalOpen && (
        <ModalGestionMentee
          mentee={menteeEditar}
          onClose={cerrarModal}
          onSave={guardarMentee}
        />
      )}

      {/* MODAL IMPORTAR */}

      {modalImportarOpen && (
        <ModalImportarMentees
          menteesExistentes={mentees}
          onClose={cerrarModalImportar}
        />
      )}

      {/* MODAL DETALLES */}

      {modalDetallesOpen && menteeDetalles && (
        <ModalDetallesMentee
          mentee={menteeDetalles}
          onClose={cerrarDetallesMentee}
        />
      )}
    </div>
  );
}
