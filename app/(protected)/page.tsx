import { listSubmissions } from "../../lib/db";
import { PullResponsesButton } from "../../components/PullResponsesButton";
import { SubmissionsExplorer } from "../../components/SubmissionsExplorer";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const submissions = listSubmissions();

  return (
    <>
      <div className="panel">
        <PullResponsesButton />
      </div>

      <SubmissionsExplorer submissions={submissions} />
    </>
  );
}
