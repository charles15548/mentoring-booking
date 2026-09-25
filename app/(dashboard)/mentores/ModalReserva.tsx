"use client";

import { useEffect, useState } from "react";

import type { BookingSlot } from "@/models/booking.model";

import { getCurrentProfile } from "@/services/auth.service";

import { supabase } from "@/lib/supabase";

type Mentor = {
  id: string;
  name: string;
  email: string;
};

type BookingService = {
  id: string;
  name: string;
  duration: string;
};

type Props = {
  mentor: Mentor;

  slot: BookingSlot;

  service: BookingService;

  onClose: () => void;

  onSuccess: () => void;
};

export default function ModalReserva({
  mentor,
  slot,
  service,
  onClose,
  onSuccess,
}: Props) {
  const [customerName, setCustomerName] = useState("");

  const [customerEmail, setCustomerEmail] = useState("");

  const [isBooking, setIsBooking] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    async function cargarUsuario() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) return;

      const { data: profile } = await getCurrentProfile(data.user.id);

      if (!profile) return;

      setCustomerName(
        [profile.nombres, profile.apellidos].filter(Boolean).join(" ") ||
          profile.email,
      );

      setCustomerEmail(profile.email);
    }

    void cargarUsuario();
  }, []);

  async function confirmar() {
    if (!customerName || !customerEmail) {
      setError("No se pudo obtener la información del usuario.");

      return;
    }

    try {
      setIsBooking(true);
      setError("");

      const response = await fetch("/api/bookings", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          /*
                El business ya no necesita
                venir desde page.tsx.
              */

          staffId: mentor.id,

          serviceId: service.id,

          startAt: slot.startAt,

          endAt: slot.endAt,

          customerName,

          customerEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la reserva.");
      }

      onSuccess();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo crear la reserva.",
      );
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="booking-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <p className="eyebrow">NUEVA RESERVA</p>

        <h2>Confirma tu sesión</h2>

        <div className="booking-summary">
          <span>Mentor</span>

          <strong>{mentor.name}</strong>

          <span>{slot.day}</span>

          <strong>{slot.time}</strong>

          <small>{service.name}</small>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          className="primary-button"
          disabled={isBooking}
          onClick={() => void confirmar()}
        >
          {isBooking ? "Reservando..." : "Confirmar reserva"}
        </button>
      </div>
    </div>
  );
}
