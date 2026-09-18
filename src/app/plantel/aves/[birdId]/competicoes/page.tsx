import { AuthProvider } from "../../../../../lib/auth/auth-context";
import { CompetitionHistoryScreen } from "./competition-history-screen";

interface CompetitionHistoryPageProps {
  params: Promise<{ birdId: string }>;
}

export default async function CompetitionHistoryPage({ params }: CompetitionHistoryPageProps) {
  const { birdId } = await params;

  return (
    <AuthProvider>
      <CompetitionHistoryScreen birdId={birdId} />
    </AuthProvider>
  );
}
