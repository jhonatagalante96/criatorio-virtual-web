import { AuthProvider } from "../../../../../../lib/auth/auth-context";
import { CompetitionHistoryScreen } from "../competition-history-screen";

interface CompetitionDetailPageProps {
  params: Promise<{ birdId: string; competitionId: string }>;
}

export default async function CompetitionDetailPage({ params }: CompetitionDetailPageProps) {
  const { birdId, competitionId } = await params;

  return (
    <AuthProvider>
      <CompetitionHistoryScreen birdId={birdId} competitionId={competitionId} />
    </AuthProvider>
  );
}
