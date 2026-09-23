"use client";

import { useEffect, useState } from "react";

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
  password?: string;
};

export default function GestionMentoresPage() {
  const [mentores, setMentores] = useState<Mentor[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mentorEditar, setMentorEditar] = useState<Mentor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("No existe una sesión activa.");
    }

    return session.access_token;
  }

  async function readResponse(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Respuesta no JSON:", text);
      throw new Error(`La API no devolvió JSON. Código HTTP: ${response.status}`);
    }

    return response.json();
  }

  async function cargarMentores() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const token = await getToken();
      const response = await fetch("/api/coordinador/gestionMentores", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron obtener los mentores.");
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

  function nuevoMentor() {
    setMentorEditar(null);
    setModalOpen(true);
  }

  function editarMentor(mentor: Mentor) {
    setMentorEditar(mentor);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setMentorEditar(null);
  }

  async function guardarMentor(formData: MentorFormData) {
    try {
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

      const response = await fetch("/api/coordinador/gestionMentores", {
        method: editando ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el mentor.");
      }

      cerrarModal();
      await cargarMentores();
      window.alert(
        editando
          ? "Mentor actualizado correctamente."
          : "Mentor creado correctamente.",
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "No se pudo guardar el mentor.",
      );
    }
  }

  async function eliminarMentor(mentor: Mentor) {
    if (!window.confirm(`¿Seguro que deseas eliminar a ${mentor.name}?`)) return;

    try {
      const token = await getToken();
      const response = await fetch("/api/coordinador/gestionMentores", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          staffId: mentor.staffId,
          profileId: mentor.profileId,
        }),
      });
      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el mentor.");
      }

      await cargarMentores();
      window.alert("Mentor eliminado correctamente.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el mentor.",
      );
    }
  }

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">COORDINACIÓN · PROUNI</p>
          <h1>Gestión de mentores</h1>
          <p className="intro">
            Mentores registrados como personal en Microsoft Bookings.
          </p>
        </div>

        <button className="primary-button" onClick={nuevoMentor}>
          + Nuevo mentor
        </button>
      </section>

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      {isLoading ? (
        <section className="empty-state">
          <h2>Cargando mentores...</h2>
        </section>
      ) : mentores.length === 0 ? (
        <section className="empty-state">
          <h2>No hay mentores en Microsoft Bookings</h2>
          <p>Agrega personal al Booking Agendar mentorías.</p>
        </section>
      ) : (
        <section className="mentor-management-list">
          {mentores.map((mentor) => (
            <article
              key={mentor.staffId}
              className="mentor-management-card"
            >
              <div>
                {mentor.foto_url && (
                  <img
                    src={mentor.foto_url}
                    alt={`Foto de ${mentor.name}`}
                    className="mentor-management-avatar"
                    width={56}
                    height={56}
                  />
                )}

                <strong>{mentor.name}</strong>
                <p>{mentor.email}</p>
                <small>{mentor.telefono || "Sin teléfono"}</small>
                <small>{mentor.especialidad || "Sin especialidad"}</small>
                {mentor.resumen && <p>{mentor.resumen}</p>}
              </div>

              <div>
                <span>
                  {mentor.tieneCuenta
                    ? mentor.activo
                      ? "Cuenta vinculada"
                      : "Cuenta inactiva"
                    : "Solo Bookings"}
                </span>
                <button onClick={() => editarMentor(mentor)}>Editar</button>
                <button onClick={() => void eliminarMentor(mentor)}>
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
    </div>
  );
}
