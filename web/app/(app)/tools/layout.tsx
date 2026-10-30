// The tools are app screens: the footer closes slim, without the wordmark (globals.css, "App screens").
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <div data-app-screen>{children}</div>;
}
