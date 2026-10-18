"use client";

import React, { useState } from "react";
import { validateCustomDomain, getDnsVerificationInstructions, type DnsInstructions } from "@/lib/domains/rules";
import { DomainStatus } from "@prisma/client";

interface DomainRecord {
  id: string;
  domain: string;
  status: DomainStatus;
  verificationToken: string;
  sslActive: boolean;
  dnsInstructions: DnsInstructions[];
}

interface CustomDomainSettingsProps {
  schoolCode: string;
  initialDomains?: DomainRecord[];
}

export function CustomDomainSettings({ schoolCode: _schoolCode, initialDomains = [] }: CustomDomainSettingsProps) {
  const [domains, setDomains] = useState<DomainRecord[]>(
    initialDomains.length > 0
      ? initialDomains
      : [
          {
            id: "dom-1",
            domain: "portal.myschool.edu.ng",
            status: DomainStatus.ACTIVE,
            verificationToken: "octalve-domain-verify-8f4b12c98d7a123e",
            sslActive: true,
            dnsInstructions: getDnsVerificationInstructions("portal.myschool.edu.ng", "octalve-domain-verify-8f4b12c98d7a123e"),
          },
        ],
  );

  const [inputDomain, setInputDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateCustomDomain(inputDomain);
    if (!validation.valid || !validation.normalized) {
      setError(validation.error ?? "Invalid domain format");
      return;
    }

    if (domains.some((d) => d.domain === validation.normalized)) {
      setError("This domain is already registered for this institution.");
      return;
    }

    const token = `octalve-domain-verify-${Math.random().toString(16).substring(2, 10)}`;
    const newDomain: DomainRecord = {
      id: `dom-${Date.now()}`,
      domain: validation.normalized,
      status: DomainStatus.PENDING_VERIFICATION,
      verificationToken: token,
      sslActive: false,
      dnsInstructions: getDnsVerificationInstructions(validation.normalized, token),
    };

    setDomains((prev) => [newDomain, ...prev]);
    setInputDomain("");
  };

  const handleVerify = (id: string) => {
    setIsVerifying(id);
    setTimeout(() => {
      setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, status: DomainStatus.ACTIVE, sslActive: true } : d)));
      setIsVerifying(null);
    }, 1200);
  };

  const handleDelete = (id: string) => {
    setDomains((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Custom Domains & White-Labeling</h3>
        <p className="text-sm text-muted-foreground">
          Map your school's branded domain (e.g. portal.myschool.edu) to provide a seamless white-label portal experience.
        </p>
      </div>

      <form onSubmit={handleAddDomain} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <input
            type="text"
            value={inputDomain}
            onChange={(e) => setInputDomain(e.target.value)}
            placeholder="portal.yourschool.edu"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
        >
          Add Custom Domain
        </button>
      </form>

      <div className="space-y-4">
        {domains.map((dom) => (
          <div key={dom.id} className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">{dom.domain}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    dom.status === DomainStatus.ACTIVE
                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {dom.status === DomainStatus.ACTIVE ? "Active & Verified" : "Pending Verification"}
                </span>
                {dom.sslActive && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    SSL Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {dom.status !== DomainStatus.ACTIVE && (
                  <button
                    onClick={() => handleVerify(dom.id)}
                    disabled={isVerifying === dom.id}
                    className="rounded border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition disabled:opacity-50"
                  >
                    {isVerifying === dom.id ? "Checking DNS..." : "Verify DNS"}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(dom.id)}
                  className="rounded px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
                >
                  Remove
                </button>
              </div>
            </div>

            {dom.status !== DomainStatus.ACTIVE && (
              <div className="rounded-md bg-muted/60 p-4 text-xs space-y-3">
                <p className="font-semibold text-foreground">Configure the following DNS records with your registrar:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dom.dnsInstructions.map((dns, idx) => (
                    <div key={idx} className="rounded border border-border bg-background p-3 space-y-1">
                      <div className="flex justify-between text-muted-foreground font-mono">
                        <span>Type: {dns.type}</span>
                        <span>Host: {dns.host}</span>
                      </div>
                      <div className="font-mono text-foreground font-semibold break-all">{dns.value}</div>
                      <p className="text-[11px] text-muted-foreground">{dns.instructions}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
