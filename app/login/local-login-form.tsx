"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getCurrentProfile } from "@/services/auth.service";
import { supabase } from "@/lib/supabase";

export default function LocalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setErrorMessage("Correo o contraseña incorrectos.");
      setIsLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await getCurrentProfile(
      data.user.id,
    );

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setErrorMessage("No se pudo cargar el perfil de tu usuario.");
      setIsLoading(false);
      return;
    }

    if (profile.rol === "coordinador") {
      router.replace("/coordinador");
    } else if (profile.rol === "mentor") {
      router.replace("/horarios");
    } else {
      router.replace("/mentores");
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">P</span>
          <div>
            <strong>PROUNI</strong>
            <small>Mentorías</small>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">ACCESO LOCAL</p>
          <h1>Ingresa a tu espacio.</h1>
          <p>Consulta tus mentores, horarios y reservas.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo institucional
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu.correo@patronato.edu.pe"
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu contraseña"
              required
            />
          </label>

          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button className="primary-button" disabled={isLoading}>
            {isLoading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="login-switch">
          ¿Aún no tienes cuenta? <Link href="/registro">Crear cuenta</Link>
        </p>
      </section>

      <aside className="login-aside">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-note">
          <span>PROUNI</span>
          <p>Un espacio para avanzar con intención.</p>
        </div>
      </aside>
    </main>
  );
}
