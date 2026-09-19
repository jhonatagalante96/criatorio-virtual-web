import { AuthProvider } from "../../lib/auth/auth-context";
import { CompetitionsListScreen } from "./competitions-list-screen";

interface CompetitionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CompetitionsPage({ searchParams }: CompetitionsPageProps) {
  const query = await searchParams;

  const parseParam = (val: string | string[] | undefined): string | undefined => {
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const initialFilters = {
    birdId: parseParam(query.birdId),
    category: parseParam(query.category),
    fromDate: parseParam(query.fromDate),
    search: parseParam(query.search),
    toDate: parseParam(query.toDate)
  };

  const pageStr = parseParam(query.page);
  const initialPage = pageStr && !Number.isNaN(Number(pageStr)) && Number(pageStr) > 0 ? Number(pageStr) : 1;

  return (
    <AuthProvider>
      <CompetitionsListScreen initialFilters={initialFilters} initialPage={initialPage} />
    </AuthProvider>
  );
}
