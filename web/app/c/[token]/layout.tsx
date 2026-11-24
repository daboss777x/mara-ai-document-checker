import type { Metadata } from "next";
import { ClientToastProvider } from "@/components/client/toast-provider";

export const metadata: Metadata = {
  title: "Your closing checklist",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClientLinkLayout({ children }: { children: React.ReactNode }) {
  return <ClientToastProvider>{children}</ClientToastProvider>;
}
