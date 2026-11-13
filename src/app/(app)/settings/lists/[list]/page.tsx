import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListItemsEditor } from "@/features/settings/components/list-items-editor";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getListItems } from "@/features/settings/queries";
import {
  isListSlug,
  LIST_PAGES,
  type ListKind,
} from "@/features/settings/schema";

export async function generateMetadata({
  params,
}: PageProps<"/settings/lists/[list]">): Promise<Metadata> {
  const { list } = await params;
  const title = isListSlug(list) ? LIST_PAGES[list].title : "Settings";
  return { title: `${title} · HandMadesByUs` };
}

// The slug comes from the URL, so it's read inside <Suspense>: the shell (back link and
// placeholder rows) shows instantly on navigation, then the list streams in.
export default function ListPage({
  params,
}: PageProps<"/settings/lists/[list]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <ListContent params={params} />
      </Suspense>
    </section>
  );
}

async function ListContent({
  params,
}: Pick<PageProps<"/settings/lists/[list]">, "params">) {
  const { list } = await params;
  if (!isListSlug(list)) notFound();
  const { kind, title, noun } = LIST_PAGES[list];
  return (
    <>
      <SettingsHeader
        title={title}
        description={`The choices offered wherever a ${noun} is picked. Reorder them to change that order.`}
      />
      <Items kind={kind} noun={noun} />
    </>
  );
}

async function Items({ kind, noun }: { kind: ListKind; noun: string }) {
  const items = await getListItems(kind);
  return <ListItemsEditor kind={kind} noun={noun} items={items} />;
}
