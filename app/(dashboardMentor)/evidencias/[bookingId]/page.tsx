import MentorEvidenceDetail from "@/components/mentor-evidence-detail";

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export default async function EvidenciasDetailPage({ params }: PageProps) {
  const { bookingId } = await params;

  // Normalizar una sola vez si Next.js entrega
  // el identificador todavía codificado.
  const normalizedBookingId = /%[0-9A-Fa-f]{2}/.test(bookingId)
    ? decodeURIComponent(bookingId)
    : bookingId;

  return <MentorEvidenceDetail bookingId={normalizedBookingId} />;
}
