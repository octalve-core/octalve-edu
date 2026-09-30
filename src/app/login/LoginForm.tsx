"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";

type Status = "idle" | "submitting" | "success" | "paused";

// A client-side courtesy pause after the server says "too many attempts" —
// it stops a user (or a stuck script) from hammering the endpoint while the
// server-side window drains. It is NOT the enforcement; the server is.
const PAUSE_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== "paused") return;
    if (secondsLeft <= 0) {
      setStatus("idle");
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, secondsLeft]);

  const busy = status === "submitting" || status === "success";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;

    setFormError(null);
    const trimmedEmail = email.trim();
    const nextEmailError = !trimmedEmail
      ? "Enter your email address."
      : !EMAIL_PATTERN.test(trimmedEmail)
        ? "Enter a valid email address."
        : null;
    const nextPasswordError = !password ? "Enter your password." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError) return emailRef.current?.focus();
    if (nextPasswordError) return passwordRef.current?.focus();

    setStatus("submitting");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.ok) {
        setStatus("success");
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      // Never keep a rejected password in memory/on screen.
      setPassword("");

      if (res.status === 429) {
        setSecondsLeft(PAUSE_SECONDS);
        setStatus("paused");
        return;
      }

      setStatus("idle");
      if (res.status === 401) {
        // One message for "no such account" and "wrong password" — the UI
        // must not re-introduce the enumeration the API carefully avoids.
        setFormError(
          "The email or password you entered is incorrect. Check your details and try again.",
        );
        passwordRef.current?.focus();
        return;
      }
      setFormError("We couldn't sign you in right now. Please try again in a moment.");
    } catch {
      setPassword("");
      setStatus("idle");
      setFormError("Can't reach the server. Check your internet connection and try again.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
        Sign in to continue to your school workspace.
      </p>

      <div className="mt-6 space-y-4 empty:mt-0">
        {formError && <Alert variant="error">{formError}</Alert>}
        {status === "paused" && (
          <Alert variant="warning" title="Sign-in is paused for a moment">
            <span className="sr-only">Too many unsuccessful attempts. Please wait a moment and try again.</span>
            <span aria-hidden="true">
              Too many unsuccessful attempts. For your security, please wait {secondsLeft}s and try
              again.
            </span>
          </Alert>
        )}
        {status === "success" && (
          <Alert variant="success">Signed in. Taking you to your dashboard…</Alert>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <TextField
          ref={emailRef}
          label="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          error={emailError}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          disabled={busy}
          placeholder="you@yourschool.com"
        />

        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
          }}
          error={passwordError}
          autoComplete="current-password"
          maxLength={128}
          disabled={busy}
          placeholder="Enter your password"
        />

        <Button
          type="submit"
          className="w-full"
          loading={status === "submitting"}
          disabled={status === "paused" || status === "success"}
        >
          {status === "submitting"
            ? "Signing in…"
            : status === "success"
              ? "Signed in"
              : status === "paused"
                ? `Try again in ${secondsLeft}s`
                : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
        Trouble signing in? Contact your school administrator.
      </p>
    </div>
  );
}
