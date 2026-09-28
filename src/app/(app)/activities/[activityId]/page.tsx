import { ActivityDetailClient } from "@/components/ActivityDetailClient";
import { StravaDisabledNotice } from "@/components/StravaDisabledNotice";
import { isStravaEnabled } from "@/lib/server/strava/config";
export default async function ActivityPage({ params }: { params: Promise<{ activityId: string }> }) { if (!isStravaEnabled()) return <StravaDisabledNotice />; const { activityId } = await params; return <ActivityDetailClient activityId={activityId} />; }
