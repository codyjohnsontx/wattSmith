import { ActivitiesClient } from "@/components/ActivitiesClient";
import { StravaDisabledNotice } from "@/components/StravaDisabledNotice";
import { isStravaEnabled } from "@/lib/server/strava/config";
export default function ActivitiesPage() { return isStravaEnabled() ? <ActivitiesClient /> : <StravaDisabledNotice />; }
