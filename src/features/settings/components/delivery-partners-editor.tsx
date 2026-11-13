"use client";

import { validateThenRun } from "@/lib/client-action";
import {
  addDeliveryPartner,
  moveDeliveryPartner,
  setDeliveryPartnerActive,
  updateDeliveryPartner,
} from "../actions";
import type { ManagedItem } from "../queries";
import {
  deliveryPartnerSchema,
  moveSchema,
  setActiveSchema,
  updateDeliveryPartnerSchema,
} from "../schema";
import { ManagedList, type DetailField } from "./managed-list";

const trackingField: DetailField = {
  key: "trackingUrlTemplate",
  label: "Tracking link (optional)",
  placeholder: "https://www.delhivery.com/track/package/{awb}",
  help: "Put {awb} where the AWB number goes. Used to open tracking from an order.",
};

export function DeliveryPartnersEditor({ items }: { items: ManagedItem[] }) {
  return (
    <ManagedList
      noun="delivery partner"
      items={items}
      detailField={trackingField}
      onAdd={({ name, detail }) =>
        validateThenRun(
          deliveryPartnerSchema,
          { name, trackingUrlTemplate: detail },
          addDeliveryPartner,
        )
      }
      onUpdate={(id, { name, detail }) =>
        validateThenRun(
          updateDeliveryPartnerSchema,
          { id, name, trackingUrlTemplate: detail },
          updateDeliveryPartner,
        )
      }
      onSetActive={(id, active) =>
        validateThenRun(
          setActiveSchema,
          { id, active },
          setDeliveryPartnerActive,
        )
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveDeliveryPartner)
      }
    />
  );
}
