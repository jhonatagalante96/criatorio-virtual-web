import { AuthProvider } from "../../../lib/auth/auth-context";
import { CompetitionWizard } from "./competition-wizard";

interface CompetitionCreatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompetitionCreatePage({ searchParams }: CompetitionCreatePageProps) {
  const query = await searchParams;
  const birdId = query.birdId;
  const initialBirdId = Array.isArray(birdId) ? birdId[0] : birdId;

  return (
    <AuthProvider>
      <CompetitionWizard initialBirdId={initialBirdId} />
    </AuthProvider>
  );
}
