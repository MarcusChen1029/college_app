import Link from "next/link";
import { ResumeBuilder } from "@/components/ResumeBuilder";

export const metadata = { title: "Résumé" };

export default function ResumePage() {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/tools" className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">
          ← Tools
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Résumé</h1>
        <p className="text-sm text-zinc-500">An activity resume built from your Activities page and profile. Edit the header, then print or copy it.</p>
      </div>
      <ResumeBuilder />
    </div>
  );
}
