"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SetupWizardFormProps {
  requiresToken: boolean;
}

export function SetupWizardForm({ requiresToken }: SetupWizardFormProps) {
  const router = useRouter();

  const [schoolName, setSchoolName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [createdAdminEmail, setCreatedAdminEmail] = useState("");

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    schoolName.trim().length > 0 &&
    name.trim().length > 0 &&
    hasMinLength &&
    hasLetter &&
    hasNumber &&
    passwordsMatch &&
    (!requiresToken || setupToken.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!canSubmit) {
      setErrorMessage("Please fill in every field correctly before continuing.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(setupToken.trim() ? { "x-setup-token": setupToken.trim() } : {}),
        },
        body: JSON.stringify({
          schoolName: schoolName.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          ...(setupToken.trim() ? { setupToken: setupToken.trim() } : {}),
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error?.message ?? "Failed to complete setup");
      }

      setIsCompleted(true);
      setCreatedAdminEmail(email.trim().toLowerCase());

      setTimeout(() => {
        router.push("/login");
      }, 3500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          <h1 className="mb-2 text-2xl font-bold text-white">Setup complete</h1>
          <p className="mb-6 text-sm leading-relaxed text-slate-400">
            The administrator account for{" "}
            <span className="font-medium text-white">{createdAdminEmail}</span> has been created.
            This setup wizard is now permanently disabled.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Proceed to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl sm:p-10">
        <div className="mb-8 border-b border-slate-800 pb-6">
          <span className="text-lg font-bold tracking-tight text-white">Octalve Edu</span>
          <p className="text-xs text-slate-400">First-run setup</p>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">
            Initialize this instance
          </h1>
          <p className="text-sm leading-relaxed text-slate-400">
            This runs once, on a fresh install. It creates your school and its first
            administrator account, then disables itself.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wider text-slate-300 uppercase">
              School name
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. Bright Future Academy"
              disabled={isSubmitting}
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wider text-slate-300 uppercase">
              Administrator name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amina Yusuf"
              disabled={isSubmitting}
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wider text-slate-300 uppercase">
              Administrator email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourschool.com"
              disabled={isSubmitting}
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          {requiresToken && (
            <div className="rounded-xl border border-amber-500/20 bg-slate-950/70 p-4">
              <label className="mb-2 block text-xs font-semibold tracking-wider text-amber-300 uppercase">
                Deployment setup token
              </label>
              <input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder="Enter SETUP_TOKEN from your environment"
                disabled={isSubmitting}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Matches the <code className="text-amber-400">SETUP_TOKEN</code> environment
                variable on this server.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium tracking-wider text-slate-300 uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium tracking-wider text-slate-300 uppercase">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs">
            <div className={hasMinLength ? "text-emerald-400" : "text-slate-500"}>
              ✓ At least 8 characters
            </div>
            <div className={hasLetter && hasNumber ? "text-emerald-400" : "text-slate-500"}>
              ✓ Contains both letters and numbers
            </div>
            <div className={passwordsMatch ? "text-emerald-400" : "text-slate-500"}>
              ✓ Passwords match
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isSubmitting ? "Setting up..." : "Complete setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
