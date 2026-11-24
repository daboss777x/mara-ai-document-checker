import type { Metadata } from "next";
import { renderWelcome, type SearchParams } from "./render-welcome";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return renderWelcome(searchParams, "intro");
}
