export type BookingStatus = "confirmed" | "cancelled" | "completed";

export interface BookingSlot {
  id: string;
  day: string;
  time: string;
  available: boolean;

  startAt: string;
  endAt: string;

  staffId?: string;
}

export interface CreateBookingInput {
  businessId: string;

  startAt: string;
  endAt: string;

  staffId: string;
  serviceId: string;

  customerName: string;
  customerEmail: string;
}