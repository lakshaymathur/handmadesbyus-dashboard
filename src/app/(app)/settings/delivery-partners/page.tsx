import type { Metadata } from "next";
import { Suspense } from "react";
import { DeliveryPartnersEditor } from "@/features/settings/components/delivery-partners-editor";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getDeliveryPartners } from "@/features/settings/queries";

export const metadata: Metadata = {
  title: "Delivery partners · HandMadesByUs",
};

export default function DeliveryPartnersPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader
        title="Delivery partners"
        description="Couriers that carry parcels, even when booked through an aggregator."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Partners />
      </Suspense>
    </section>
  );
}

async function Partners() {
  return <DeliveryPartnersEditor items={await getDeliveryPartners()} />;
}
