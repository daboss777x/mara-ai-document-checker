import { renderWelcome, type SearchParams } from "@/app/login/render-welcome";

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  return renderWelcome(searchParams, "intro");
}
