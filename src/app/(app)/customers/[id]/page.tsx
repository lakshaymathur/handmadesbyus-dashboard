import { AtSign, Mail, Pencil, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageSection } from "@/components/page-section";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AddressButtons } from "@/features/customers/components/address-form";
import { formatAddress, formatMobile } from "@/features/customers/format";
import { getCustomer } from "@/features/customers/queries";
import { SOURCE_LABELS } from "@/features/customers/schema";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Customer · HandMadesByUs" };

// The id comes from the URL, so it's read inside <Suspense>.
export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <Customer params={params} />
      </Suspense>
    </section>
  );
}

const linkRow =
  "flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-muted wrap-anywhere";

async function Customer({
  params,
}: Pick<PageProps<"/customers/[id]">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const details = [
    customer.source && SOURCE_LABELS[customer.source],
    `Added ${formatDate(customer.createdAt)}`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer.code} · ${details.join(" · ")}`}
        back={{ href: "/customers", label: "Customers" }}
        action={
          <Link
            href={`/customers/${customer.id}/edit`}
            className={buttonVariants({
              variant: "outline",
              className: "h-11",
            })}
          >
            <Pencil aria-hidden />
            Edit
          </Link>
        }
      />

      <div className="flex flex-col">
        <a href={`tel:+91${customer.mobile}`} className={linkRow}>
          <Phone className="size-4 text-muted-foreground" aria-hidden />
          {formatMobile(customer.mobile)}
        </a>
        {customer.altMobile && (
          <a href={`tel:+91${customer.altMobile}`} className={linkRow}>
            <Phone className="size-4 text-muted-foreground" aria-hidden />
            {formatMobile(customer.altMobile)}
            <span className="text-sm text-muted-foreground">(alternate)</span>
          </a>
        )}
        {customer.instagramHandle && (
          <a
            href={`https://www.instagram.com/${customer.instagramHandle}/`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkRow}
          >
            <AtSign className="size-4 text-muted-foreground" aria-hidden />
            {customer.instagramHandle}
          </a>
        )}
        {customer.email && (
          <a href={`mailto:${customer.email}`} className={linkRow}>
            <Mail className="size-4 text-muted-foreground" aria-hidden />
            {customer.email}
          </a>
        )}
      </div>

      {customer.notes && (
        <PageSection title="Notes">
          <p className="wrap-anywhere whitespace-pre-line">{customer.notes}</p>
        </PageSection>
      )}

      <PageSection title="Addresses">
        {customer.addresses.length === 0 ? (
          <p className="text-muted-foreground">No address yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {customer.addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-lg border p-3 wrap-anywhere"
              >
                {address.isDefault && (
                  <span className="mb-1 block text-sm font-medium text-muted-foreground">
                    Default
                  </span>
                )}
                {formatAddress(address)}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/customers/${customer.id}/addresses/${address.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "h-10",
                    })}
                  >
                    Edit
                  </Link>
                  <AddressButtons
                    addressId={address.id}
                    isDefault={address.isDefault}
                    isOnly={customer.addresses.length === 1}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/customers/${customer.id}/addresses/new`}
          className={buttonVariants({ variant: "outline", className: "h-11" })}
        >
          <Plus aria-hidden />
          Add an address
        </Link>
      </PageSection>

      <PageSection title="Orders">
        <p className="text-muted-foreground">
          Order history, lifetime spend and balance due arrive with orders (M4).
        </p>
      </PageSection>
    </>
  );
}
