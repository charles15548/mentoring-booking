"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpWithEmail } from "@/services/auth.service";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const { data, error: signUpError } = await signUpWithEmail(
      name,
      email,
      password,
    );
    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Este correo ya tiene una cuenta."
          : "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.",
      );
      setLoading(false);
      return;
    }
    if (data.session) router.replace("/mentores");
    else
      setMessage(
        "Cuenta creada. Revisa tu correo para confirmar el acceso y luego inicia sesión.",
      );
    setLoading(false);
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
          <p className="eyebrow">NUEVO ESPACIO</p>
          <h1>Empieza tu proceso.</h1>
          <p>
            Crea tu cuenta para encontrar tu mentor y organizar tus próximas
            sesiones.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Nombre completo
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="María González"
              minLength={2}
              required
            />
          </label>
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
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}
          <button className="primary-button" disabled={loading}>
            {loading ? "Creando cuenta..." : "Crear mi cuenta →"}
          </button>
        </form>
        <p className="login-switch">
          ¿Ya tienes cuenta? <Link href="/login">Volver al acceso</Link>
        </p>
        <p className="login-foot">
          Tu cuenta se crea como mentee. Coordinación asignará tu mentoría.
        </p>
      </section>
      <aside className="login-aside">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-note">
          <span>02</span>
          <p>Tu proceso merece un espacio para avanzar con intención.</p>
        </div>
        <div className="aside-footer">
          PATRONATO DE LA UNI <span>·</span> DESARROLLO CON PROPÓSITO
        </div>
      </aside>
    </main>
  );
}
