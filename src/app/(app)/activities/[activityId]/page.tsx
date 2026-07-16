import { ActivityDetailClient } from "@/components/ActivityDetailClient";
export default async function ActivityPage({ params }: { params: Promise<{ activityId: string }> }) { const { activityId } = await params; return <ActivityDetailClient activityId={activityId} />; }
