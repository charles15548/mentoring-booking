import MentorEvidenceDetail from "@/components/mentor-evidence-detail";

type PageProps = {
params: Promise<{
bookingId: string;
}>;
};

export default async function EvidenciasDetailPage({
params,
}: PageProps) {
const { bookingId } = await params;

return ( <MentorEvidenceDetail
   bookingId={bookingId}
 />
);
}
