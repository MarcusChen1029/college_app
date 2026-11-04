import { JoinInvite } from "@/components/classroom/JoinInvite";

export const metadata = { title: "Join a class" };

// A class invite link: /join#ABCD2345. The page is a client component because the code lives in the address fragment,
// which only the browser can read (it never reaches a server).
export default function JoinRoute() {
  return (
    <div data-app-screen>
      <JoinInvite />
    </div>
  );
}
