import Link from "next/link";

export default function MentorPage() {
  return (
    <main className="role-page">
      <p className="eyebrow">ESPACIO DEL MENTOR</p>
      <h1>Panel de mentoría</h1>
      <p>Desde aquí podrás revisar tus mentees, sesiones y acuerdos.</p>
      <Link href="/">Volver al inicio</Link>
    </main>
  );
}
