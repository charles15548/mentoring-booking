"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import ModalGestionMentee from "./ModalGestionMentee";

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
  const [menteeEditar, setMenteeEditar] = useState<Mentee | null>(null);
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
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudieron obtener los mentees.",
        );
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
    try {
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

      cerrarModal();
      await cargarMentees();

      window.alert(
        editando
          ? "Mentee actualizado correctamente."
          : "Mentee creado correctamente.",
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el mentee.",
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
            Participantes registrados para recibir mentorías y vinculados como
            clientes en Microsoft Bookings.
          </p>
        </div>

        <button className="primary-button" onClick={nuevoMentee}>
          + Nuevo mentee
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
        /*
          Se reutilizan estas clases para conservar el diseño actual de la
          pantalla de mentores sin requerir nuevos estilos CSS.
        */
        <section className="mentor-management-list">
          {mentees.map((mentee) => (
            <article
              key={mentee.customerId}
              className="mentor-management-card"
            >
              <div>
                {mentee.foto_url && (
                  <img
                    src={mentee.foto_url}
                    alt={`Foto de ${mentee.name}`}
                    className="mentor-management-avatar"
                    width={56}
                    height={56}
                  />
                )}

                <strong>{mentee.name} |  {mentee.email} </strong>

                

                <small>N° Telefono: {mentee.telefono || "Sin teléfono"} {" "}</small>
                <br/>
                <small>Especialidad: {mentee.especialidad || "Sin especialidad"}</small>
                <br/><br/>
                {mentee.resumen && <p>{mentee.resumen}</p>}
              </div>

              <div>
                <span>
                  {mentee.tieneCuenta
                    ? mentee.activo
                      ? "Cuenta vinculada"
                      : "Cuenta inactiva"
                    : "Solo Bookings"}
                </span>

                <button onClick={() => editarMentee(mentee)}>Editar</button>

                <button onClick={() => void eliminarMentee(mentee)}>
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modalOpen && (
        <ModalGestionMentee
          mentee={menteeEditar}
          onClose={cerrarModal}
          onSave={guardarMentee}
        />
      )}
    </div>
  );
}
