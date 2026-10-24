import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-zinc-500">We don&apos;t have that college yet.</p>
      <Link href="/colleges" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
        ← All colleges
      </Link>
    </div>
  );
}
