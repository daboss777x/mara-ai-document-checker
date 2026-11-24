import { NextResponse, type NextRequest } from "next/server";
import { getDocumentFileUrl } from "@/lib/data";

// A fresh short-lived signed link on every request; never cache it.
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /deals/:id/documents/:docId/file → 303 to a 60 s signed URL on `deal-files`
 * (docs/CONTRACTS.md §5). The data layer reads the document through RLS; Storage RLS is the second check.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const r = await getDocumentFileUrl(id, docId);
  if (!r.ok) return new NextResponse("This file isn't available right now. Try again.", { status: 502, headers: noStore });
  if (!r.data) return new NextResponse("File not found.", { status: 404, headers: noStore });
  return NextResponse.redirect(new URL(r.data.url, request.url), { status: 303, headers: noStore });
}
