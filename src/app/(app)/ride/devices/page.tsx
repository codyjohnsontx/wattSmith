import type { Metadata } from "next";
import { TrainerDiagnostics } from "@/components/TrainerDiagnostics";

export const metadata: Metadata = {
  title: "Trainer diagnostics | Wattsmith",
};

// ?device=fake swaps the Bluetooth trainer for a simulated FTMS device.
export default async function TrainerDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { device } = await searchParams;
  return <TrainerDiagnostics fake={device === "fake"} />;
}
