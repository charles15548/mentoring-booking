import type { CreateBookingInput } from "@/models/booking.model";

export async function createBooking(input: CreateBookingInput) {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error("No se pudo crear la reserva");
  return response.json();
}