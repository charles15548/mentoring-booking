"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import ModalGestionMentores from "./ModalGestionMentores";

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

  activo: boolean;

  role?: string;

  tieneCuenta: boolean;
};

export default function GestionMentoresPage() {
  const [mentores, setMentores] =
    useState<Mentor[]>([]);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [mentorEditar, setMentorEditar] =
    useState<Mentor | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ======================================================
     TOKEN SUPABASE
  ====================================================== */

  async function getToken() {
    const {
      data: { session },
    } =
      await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error(
        "No existe una sesión activa.",
      );
    }

    return session.access_token;
  }

  /* ======================================================
     CARGAR MENTORES

     IMPORTANTE:
     esta lista viene de MICROSOFT BOOKINGS.
  ====================================================== */

  async function cargarMentores() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const token = await getToken();

      const response = await fetch(
        "/api/coordinador/gestionMentores",
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
      );

      const data =
        await response.json();

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

  /* ======================================================
     NUEVO
  ====================================================== */

  function nuevoMentor() {
    setMentorEditar(null);
    setModalOpen(true);
  }

  /* ======================================================
     EDITAR
  ====================================================== */

  function editarMentor(
    mentor: Mentor,
  ) {
    setMentorEditar(mentor);
    setModalOpen(true);
  }

  /* ======================================================
     GUARDAR
  ====================================================== */

  async function guardarMentor(
    formData: {
      nombres: string;
      apellidos: string;
      email: string;
      telefono: string;
      activo: boolean;
      password?: string;
    },
  ) {
    try {
      const token =
        await getToken();

      const editando =
        Boolean(mentorEditar);

      const payload = editando
        ? {
            ...formData,

            id: mentorEditar!.id,

            staffId:
              mentorEditar!.staffId,

            profileId:
              mentorEditar!.profileId,
          }
        : formData;

      const response = await fetch(
        "/api/coordinador/gestionMentores",
        {
          method: editando
            ? "PUT"
            : "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body:
            JSON.stringify(payload),
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo guardar el mentor.",
        );
      }

      setModalOpen(false);
      setMentorEditar(null);

      await cargarMentores();

      window.alert(
        editando
          ? "Mentor actualizado correctamente."
          : "Mentor creado correctamente.",
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el mentor.",
      );
    }
  }

  /* ======================================================
     ELIMINAR
  ====================================================== */

  async function eliminarMentor(
    mentor: Mentor,
  ) {
    const confirmar =
      window.confirm(
        `¿Seguro que deseas eliminar a ${mentor.name}?`,
      );

    if (!confirmar) return;

    try {
      const token =
        await getToken(); 
      const response = await fetch(
        "/api/coordinador/gestionMentores",
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            staffId:
              mentor.staffId,

            profileId:
              mentor.profileId,
          }),
        },
      );

      const data =
        await response.json();

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

  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="page-content">

      <section className="welcome-row">
        <div>
          <p className="eyebrow">
            COORDINACIÓN · PROUNI
          </p>

          <h1>
            Gestión de mentores
          </h1>

          <p className="intro">
            Mentores registrados como personal
            en Microsoft Bookings.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={nuevoMentor}
        >
          + Nuevo mentor
        </button>
      </section>

      {errorMessage && (
        <p className="form-error">
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <section className="empty-state">
          <h2>
            Cargando mentores...
          </h2>
        </section>
      ) : mentores.length === 0 ? (
        <section className="empty-state">
          <h2>
            No hay mentores en Microsoft Bookings
          </h2>

          <p>
            Agrega personal al Booking
            Agendar mentorías.
          </p>
        </section>
      ) : (
        <section className="mentor-management-list">

          {mentores.map((mentor) => (
            <article
              key={mentor.staffId}
              className="mentor-management-card"
            >
              <div>
                <strong>
                  {mentor.name}
                </strong>

                <p>
                  {mentor.email}
                </p>

                <small>
                  {mentor.telefono ||
                    "Sin teléfono"}
                </small>
              </div>

              <div>
                <span>
                  {mentor.tieneCuenta
                    ? "Cuenta vinculada"
                    : "Solo Bookings"}
                </span>

                <button
                  onClick={() =>
                    editarMentor(
                      mentor,
                    )
                  }
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    void eliminarMentor(
                      mentor,
                    )
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
          onClose={() =>
            setModalOpen(false)
          }
          onSave={
            guardarMentor
          }
        />
      )}

    </div>
  );
}