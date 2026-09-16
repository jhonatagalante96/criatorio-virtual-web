import { AuthProvider } from "../../../lib/auth/auth-context";
import { ReproductionDetailScreen } from "../reproduction-detail-screen";

export default async function ReproductionDetailPage({
  params
}: Readonly<{ params: Promise<{ reproductionId: string }> }>) {
  const { reproductionId } = await params;
  return <AuthProvider><ReproductionDetailScreen reproductionId={reproductionId} /></AuthProvider>;
}
