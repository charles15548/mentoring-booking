import MenteeAgreements from "@/components/mentee-agreements";

export default async function MentoriaMenteeDetailPage(props: PageProps<"/mentoriasMentee/[bookingId]">) {
  const { bookingId } = await props.params;
  return <MenteeAgreements bookingId={bookingId} />;
}
