import { notFound } from "next/navigation";
import { ActivityAnalysisView } from "@/components/ActivityAnalysisView";
import { demoActivityId, getDemoActivityDetail } from "@/lib/activity/demoFixture";
import { isStravaEnabled } from "@/lib/server/strava/config";
export default async function DemoActivityPage({ params }: { params: Promise<{ activityId: string }> }) { const { activityId } = await params; if (activityId !== demoActivityId) notFound(); return <ActivityAnalysisView detail={getDemoActivityDetail()} demo stravaEnabled={isStravaEnabled()} />; }
