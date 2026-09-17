import { redirect } from "next/navigation";

// La raíz solo inicia el acceso al sistema.
export default function HomePage() {
  redirect("/login");
}
