"use client";

import React, { useState } from "react";
import { CertificateStatus } from "@prisma/client";
import { computeCertificateHash, formatCertificateNumber } from "@/lib/certificates/rules";

interface CertificateItem {
  id: string;
  studentName: string;
  admissionNo: string;
  title: string;
  certificateNo: string;
  issueDate: string;
  verificationHash: string;
  status: CertificateStatus;
}

interface CertificatesConsoleProps {
  schoolCode: string;
  initialCertificates?: CertificateItem[];
}

export function CertificatesConsole({ schoolCode, initialCertificates = [] }: CertificatesConsoleProps) {
  const [certificates, setCertificates] = useState<CertificateItem[]>(
    initialCertificates.length > 0
      ? initialCertificates
      : [
          {
            id: "cert-1",
            studentName: "Ibrahim Al-Mansur",
            admissionNo: "2026/0014",
            title: "Executive Diploma in Renewable Energy & Solar Tech",
            certificateNo: "OCT-VOC-2026-00001",
            issueDate: new Date().toISOString(),
            verificationHash: computeCertificateHash({
              tenantId: "school-tenant",
              studentId: "student-1",
              certificateNo: "OCT-VOC-2026-00001",
              title: "Executive Diploma in Renewable Energy & Solar Tech",
              issueDate: new Date(),
            }),
            status: CertificateStatus.ISSUED,
          },
        ],
  );

  const [studentName, setStudentName] = useState("");
  const [title, setTitle] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");

  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName || !title) return;

    const certNo = formatCertificateNumber("OCT", new Date().getFullYear(), certificates.length + 1);
    const issueDate = new Date();
    const verificationHash = computeCertificateHash({
      tenantId: "school-tenant",
      studentId: `student-${Date.now()}`,
      certificateNo: certNo,
      title,
      issueDate,
    });

    const newCert: CertificateItem = {
      id: `cert-${Date.now()}`,
      studentName,
      admissionNo: admissionNo || "2026/VOC",
      title,
      certificateNo: certNo,
      issueDate: issueDate.toISOString(),
      verificationHash,
      status: CertificateStatus.ISSUED,
    };

    setCertificates((prev) => [newCert, ...prev]);
    setStudentName("");
    setTitle("");
    setAdmissionNo("");
  };

  const handleRevoke = (id: string) => {
    setCertificates((prev) => prev.map((c) => (c.id === id ? { ...c, status: CertificateStatus.REVOKED } : c)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Vocational & Modular Certificates</h2>
          <p className="text-sm text-muted-foreground">
            Issue cryptographically tamper-evident certificates with unique serials and public QR verification.
          </p>
        </div>
      </div>

      <form onSubmit={handleIssue} className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Issue New Certificate</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Recipient Student Name</label>
            <input
              type="text"
              required
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="e.g. Fatima Abubakar"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Admission / Reg No</label>
            <input
              type="text"
              value={admissionNo}
              onChange={(e) => setAdmissionNo(e.target.value)}
              placeholder="e.g. 2026/VOC-082"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Certificate Title / Program</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Professional Certificate in Cybersecurity"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            Issue Credential
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Certificate No</th>
              <th className="px-4 py-3">Student Name</th>
              <th className="px-4 py-3">Certificate Title</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3">SHA-256 Fingerprint</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {certificates.map((cert) => (
              <tr key={cert.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-bold text-primary">{cert.certificateNo}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{cert.studentName}</div>
                  <div className="text-xs text-muted-foreground">{cert.admissionNo}</div>
                </td>
                <td className="px-4 py-3 text-foreground">{cert.title}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      cert.status === CertificateStatus.ISSUED
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {cert.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="w-36 truncate font-mono text-xs text-muted-foreground" title={cert.verificationHash}>
                    {cert.verificationHash}
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <a
                    href={`/api/v1/verify-certificate/${cert.certificateNo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Verify
                  </a>
                  {cert.status === CertificateStatus.ISSUED && (
                    <button onClick={() => handleRevoke(cert.id)} className="text-xs text-destructive hover:underline">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
