"use client";

import { useT } from "@/lib/i18n/client";
import { CONTACT_EMAIL } from "@/lib/legal";

/** "Contact: <address>" once lib/legal.ts has a contact address; nothing while it is still null. */
export function PaymentContact({ className }: { className?: string }) {
  const t = useT();
  if (!CONTACT_EMAIL) return null;
  return (
    <p className={className}>
      {t("payments.contact")}{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-blue-700 underline underline-offset-4">
        {CONTACT_EMAIL}
      </a>
    </p>
  );
}
