import { StartWizard } from "@/components/StartWizard";

export const metadata = { title: "Get started" };

export default function StartPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Let&apos;s set up your list</h1>
        <p className="mt-2 text-zinc-600">Three quick steps. No account needed.</p>
      </div>
      <StartWizard />
    </div>
  );
}
