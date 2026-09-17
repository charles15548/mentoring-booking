"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await getCurrentProfile(data.user.id);
    if (profileError || !profile) {
      await supabase.auth.signOut();
      setError(profileError?.code === "PGRST116" ? "Tu cuenta existe, pero todavía no tiene perfil. Ejecuta el SQL de configuración de Supabase." : "No se pudo consultar tu perfil. Revisa las políticas RLS de profiles.");
      setLoading(false);
      return;
    }

    router.replace(profile.rol === "coordinador" ? "/coordinador" : profile.rol === "mentor" ? "/mentor" : "/mentores");
  }

  return <main className="login-page"><section className="login-panel"><div className="login-brand"><span className="brand-mark">P</span><div><strong>PROUNI</strong><small>Mentorías</small></div></div><div className="login-copy"><p className="eyebrow">ESPACIO DE ACOMPAÑAMIENTO</p><h1>Tu próximo paso empieza aquí.</h1><p>Accede a tus sesiones, acuerdos y conversaciones de mentoría.</p></div><form onSubmit={handleSubmit} className="login-form"><label>Correo institucional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu.correo@patronato.edu.pe" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? "Entrando..." : "Entrar a mi espacio →"}</button></form><p className="login-switch">¿Aún no tienes cuenta? <Link href="/registro">Crear cuenta</Link></p><p className="login-foot">¿Necesitas ayuda? Contacta a coordinación.</p></section><aside className="login-aside"><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /><div className="aside-note"><span>01</span><p>Las conversaciones correctas pueden cambiar la dirección de una carrera.</p></div><div className="aside-footer">PATRONATO DE LA UNI <span>·</span> DESARROLLO CON PROPÓSITO</div></aside></main>;
}
