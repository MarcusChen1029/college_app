// Teacher pages are app screens: the footer closes slim, without the wordmark (globals.css, "App screens").
// data-teacher-screen: the page area is always at least one screen tall (globals.css, "Teacher screens"), so the footer starts
// below the fold and does not jump when a roster, a class list or the deadlines arrive and the page grows.
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-screen data-teacher-screen>
      {children}
    </div>
  );
}
