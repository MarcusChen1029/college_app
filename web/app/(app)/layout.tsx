export default function AppLayout({ children }: LayoutProps<"/">) {
  return <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8">{children}</div>;
}
