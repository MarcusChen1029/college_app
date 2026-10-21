import { ResumeBuilder } from "@/components/ResumeBuilder";

export const metadata = { title: "Resume" };

export default function ResumePage() {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Resume</h1>
        <p className="text-sm text-zinc-500">An activity resume built from your Activities page and profile. Edit the header, then print or copy it.</p>
      </div>
      <ResumeBuilder />
    </div>
  );
}
