import type { Metadata } from "next";
import { RedeemCode } from "@/components/RedeemCode";

export const metadata: Metadata = { title: "Redeem a code" };

export default function RedeemPage() {
  return (
    <div data-app-screen>
      <RedeemCode />
    </div>
  );
}
