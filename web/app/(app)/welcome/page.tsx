import type { Metadata } from "next";
import { WelcomeForm } from "@/components/WelcomeForm";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-bold">Welcome to College Tracker</h1>
      <WelcomeForm />
    </div>
  );
}
