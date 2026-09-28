import { WorkoutWorkspace } from "@/components/WorkoutWorkspace";
import { isStravaEnabled } from "@/lib/server/strava/config";

export default function WorkoutsPage() {
  return <WorkoutWorkspace initialTab="library" stravaEnabled={isStravaEnabled()} />;
}
