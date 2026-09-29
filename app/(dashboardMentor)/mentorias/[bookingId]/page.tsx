import MentorAgreements from "@/components/mentor-agreements";

export default async function MentoriaDetailPage(props: PageProps<"/mentorias/[bookingId]">) {
  const { bookingId } = await props.params;
  return <MentorAgreements bookingId={bookingId} />;
}
