import { redirect } from "next/navigation";

// El formulario de acceso vive en la portada externa de PROUNI.
// Esa portada devuelve los tokens a /acceso después de autenticar.
export default function LoginPage() {
  redirect("https://mentoriaprouni.intelectiasac.com");
}
