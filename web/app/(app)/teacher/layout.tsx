// Teacher pages are app screens: the footer closes slim, without the wordmark (globals.css, "App screens").
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <div data-app-screen>{children}</div>;
}
