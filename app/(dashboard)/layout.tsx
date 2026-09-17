import MenteeLayout from "@/components/dashboard-layout";

// (dashboard) es un route group invisible: no crea una ruta /dashboard.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MenteeLayout>{children}</MenteeLayout>;
}
