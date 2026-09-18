import { redirect } from "next/navigation";

export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ result?: string }> }>) {
  const { result } = await searchParams;
  const allowedResult = ["success", "cancelled", "expired"].includes(result ?? "") ? result : "success";
  redirect(`/assinatura?result=${allowedResult}`);
}
