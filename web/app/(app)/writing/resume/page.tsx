import { ResumeBuilder } from "@/components/ResumeBuilder";

export const metadata = { title: "Resume" };

export default function ResumePage() {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h2 className="text-xl font-semibold">Résumé</h2>
        <p className="text-sm text-zinc-500">An activity resume built from your Activities page and profile. Edit the header, then print or copy it.</p>
      </div>
      <ResumeBuilder />
    </div>
  );
}
