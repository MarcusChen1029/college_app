import { AccountPanel } from "@/components/AccountPanel";

export const metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <AccountPanel />
    </div>
  );
}
