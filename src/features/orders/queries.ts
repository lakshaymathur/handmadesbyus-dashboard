import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  customers,
  customisationChoices,
  customisationOptions,
  orderItemCustomisations,
  orderItems,
  orders,
  productionStages,
  productPhotos,
  products,
  statusHistory,
  users,
} from "@/db/schema";
import { mobileSearchDigits } from "@/features/customers/schema";
import { requireUser } from "@/lib/auth/session";
import { likeEscape } from "@/lib/like";
import { photoUrl } from "@/lib/photo-url";
import { formatCustomerId } from "@/lib/ids";
import { customerName } from "@/features/customers/format";
import { lastStage, type OrderStatus, type Stage } from "./lifecycle";
import { orderTotals, type Discount, type OrderTotals } from "./pricing";
import { customerOrderStats, type CustomerOrderStats } from "./stats";

/** How many orders the list shows at once. */
export const ORDER_LIST_LIMIT = 100;

type DiscountColumns = {
  discountType: "flat" | "percent" | null;
  discountFlat: number;
  discountPercentBp: number;
};

function discountFrom(row: DiscountColumns): Discount {
  if (row.discountType === "flat")
    return { type: "flat", paise: row.discountFlat };
  if (row.discountType === "percent") {
    return { type: "percent", bp: row.discountPercentBp };
  }
  return { type: "none" };
}

/** Totals for these orders, from their own snapshots (never the catalogue). */
async function totalsFor(
  rows: (DiscountColumns & { id: string; shippingCharged: number })[],
): Promise<Map<string, OrderTotals>> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return new Map();
  const [items, extras] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        unitCost: orderItems.unitCost,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids)),
    db
      .select({
        itemId: orderItemCustomisations.orderItemId,
        price: orderItemCustomisations.price,
        cost: orderItemCustomisations.cost,
      })
      .from(orderItemCustomisations)
      .innerJoin(
        orderItems,
        eq(orderItems.id, orderItemCustomisations.orderItemId),
      )
      .where(inArray(orderItems.orderId, ids)),
  ]);
  return new Map(
    rows.map((order) => [
      order.id,
      orderTotals({
        items: items
          .filter((i) => i.orderId === order.id)
          .map((i) => ({
            ...i,
            customisations: extras.filter((e) => e.itemId === i.id),
          })),
        discount: discountFrom(order),
        shippingCharged: order.shippingCharged,
      }),
    ]),
  );
}

export type OrderSummary = {
  id: string;
  code: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  promisedDate: string;
  status: OrderStatus;
  priority: "normal" | "urgent";
  total: number;
};

/**
 * Orders matching `query` (order code, or the customer's name or mobile), newest first,
 * at most ORDER_LIST_LIMIT. M5's dashboard replaces this list.
 */
export async function getOrders(
  query = "",
  customerId?: string,
  /** At most this many; null for all (a customer's own orders, for their totals). */
  limit: number | null = ORDER_LIST_LIMIT,
): Promise<OrderSummary[]> {
  await requireUser();
  const q = query.trim();
  const pattern = `%${likeEscape(q)}%`;
  const listQuery = db
    .select({
      id: orders.id,
      code: orders.code,
      orderDate: orders.orderDate,
      promisedDate: orders.promisedDate,
      status: orders.status,
      priority: orders.priority,
      discountType: orders.discountType,
      discountFlat: orders.discountFlat,
      discountPercentBp: orders.discountPercentBp,
      shippingCharged: orders.shippingCharged,
      customerNumber: customers.number,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        customerId ? eq(orders.customerId, customerId) : undefined,
        q === ""
          ? undefined
          : or(
              ilike(orders.code, pattern),
              ilike(
                sql`${customers.firstName} || ' ' || coalesce(${customers.lastName}, '')`,
                pattern,
              ),
              // Only a query that looks like (part of) a phone number searches
              // mobiles: "0001" means an order code, not every mobile with 0001.
              /^[\d\s+()]+$/.test(q) && mobileSearchDigits(q).length >= 5
                ? ilike(
                    customers.mobile,
                    `%${likeEscape(mobileSearchDigits(q))}%`,
                  )
                : undefined,
            ),
      ),
    )
    .orderBy(desc(orders.orderDate), desc(orders.code))
    .$dynamic();
  const rows = await (limit === null ? listQuery : listQuery.limit(limit));
  const totals = await totalsFor(rows);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    customerName: customerName(row),
    customerCode: formatCustomerId(row.customerNumber),
    orderDate: row.orderDate,
    promisedDate: row.promisedDate,
    status: row.status,
    priority: row.priority,
    total: totals.get(row.id)?.total ?? 0,
  }));
}

export type OrderItemDetail = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  thumbnailUrl: string | null;
  categoryId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  notes: string | null;
  stage: Stage;
  /** The item's category's stages, in order. */
  stages: Stage[];
  finished: boolean;
  customisations: {
    optionId: string;
    name: string;
    inputType: "none" | "text" | "choice";
    choiceId: string | null;
    choiceName: string | null;
    text: string | null;
    price: number;
    cost: number;
  }[];
};

export type HistoryEntry = {
  id: string;
  at: Date;
  by: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  /** Item stage changes: which product, and from/to stage names. */
  itemName: string | null;
  fromStage: string | null;
  toStage: string | null;
  note: string | null;
};

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  priority: "normal" | "urgent";
  channel: string | null;
  orderDate: string;
  promisedDate: string;
  deliveredDate: string | null;
  cancelReason: string | null;
  refundOwed: boolean;
  notes: string | null;
  discount: Discount;
  shippingCharged: number;
  customer: { id: string; code: string; name: string; mobile: string };
  address: {
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pin: string;
  };
  items: OrderItemDetail[];
  totals: OrderTotals;
  history: HistoryEntry[];
};

const fromStage = alias(productionStages, "from_stage");
const toStage = alias(productionStages, "to_stage");

/** One order with its items, totals and status history, or null. */
export async function getOrder(id: string): Promise<OrderDetail | null> {
  await requireUser();
  const [order] = await db
    .select({
      order: orders,
      customerNumber: customers.number,
      firstName: customers.firstName,
      lastName: customers.lastName,
      mobile: customers.mobile,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, id));
  if (!order) return null;

  const [items, extras, stages, history] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: products.name,
        sku: products.sku,
        thumbnailId: productPhotos.id,
        categoryId: orderItems.categoryId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        unitCost: orderItems.unitCost,
        notes: orderItems.notes,
        stageId: orderItems.productionStageId,
      })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(
        productPhotos,
        and(
          eq(productPhotos.productId, products.id),
          eq(productPhotos.position, 0),
        ),
      )
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.position), asc(orderItems.createdAt)),
    db
      .select({
        itemId: orderItemCustomisations.orderItemId,
        optionId: orderItemCustomisations.optionId,
        name: customisationOptions.name,
        sortOrder: customisationOptions.sortOrder,
        inputType: customisationOptions.inputType,
        choiceId: orderItemCustomisations.choiceId,
        choiceName: customisationChoices.name,
        text: orderItemCustomisations.textValue,
        price: orderItemCustomisations.price,
        cost: orderItemCustomisations.cost,
      })
      .from(orderItemCustomisations)
      .innerJoin(
        orderItems,
        eq(orderItems.id, orderItemCustomisations.orderItemId),
      )
      .innerJoin(
        customisationOptions,
        eq(customisationOptions.id, orderItemCustomisations.optionId),
      )
      .leftJoin(
        customisationChoices,
        eq(customisationChoices.id, orderItemCustomisations.choiceId),
      )
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(customisationOptions.sortOrder)),
    db
      .select({
        id: productionStages.id,
        name: productionStages.name,
        position: productionStages.position,
        categoryId: productionStages.categoryId,
      })
      .from(productionStages)
      .where(
        inArray(
          productionStages.categoryId,
          db
            .select({ id: orderItems.categoryId })
            .from(orderItems)
            .where(eq(orderItems.orderId, id)),
        ),
      )
      .orderBy(asc(productionStages.position)),
    db
      .select({
        id: statusHistory.id,
        at: statusHistory.createdAt,
        by: users.name,
        fromStatus: statusHistory.fromStatus,
        toStatus: statusHistory.toStatus,
        itemName: products.name,
        fromStage: fromStage.name,
        toStage: toStage.name,
        note: statusHistory.note,
      })
      .from(statusHistory)
      .innerJoin(users, eq(users.id, statusHistory.createdBy))
      .leftJoin(orderItems, eq(orderItems.id, statusHistory.orderItemId))
      .leftJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(fromStage, eq(fromStage.id, statusHistory.fromStageId))
      .leftJoin(toStage, eq(toStage.id, statusHistory.toStageId))
      .where(eq(statusHistory.orderId, id))
      .orderBy(desc(statusHistory.createdAt), desc(statusHistory.id)),
  ]);

  const detailItems: OrderItemDetail[] = items.map((item) => {
    const own = stages
      .filter((s) => s.categoryId === item.categoryId)
      .map(({ id: stageId, name, position }) => ({
        id: stageId,
        name,
        position,
      }));
    const stage = own.find((s) => s.id === item.stageId) ?? {
      id: item.stageId,
      name: "Unknown stage",
      position: -1,
    };
    return {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      thumbnailUrl: item.thumbnailId ? photoUrl(item.thumbnailId) : null,
      categoryId: item.categoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      notes: item.notes,
      stage,
      stages: own,
      finished: lastStage(own)?.id === stage.id,
      customisations: extras
        .filter((e) => e.itemId === item.id)
        .map(({ itemId: _item, sortOrder: _sort, ...e }) => e),
    };
  });

  const o = order.order;
  const discount = discountFrom(o);
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    priority: o.priority,
    channel: o.channel,
    orderDate: o.orderDate,
    promisedDate: o.promisedDate,
    deliveredDate: o.deliveredDate,
    cancelReason: o.cancelReason,
    refundOwed: o.refundOwed,
    notes: o.notes,
    discount,
    shippingCharged: o.shippingCharged,
    customer: {
      id: o.customerId,
      code: formatCustomerId(order.customerNumber),
      name: customerName(order),
      mobile: order.mobile,
    },
    address: {
      line1: o.deliveryLine1,
      line2: o.deliveryLine2,
      landmark: o.deliveryLandmark,
      city: o.deliveryCity,
      state: o.deliveryState,
      pin: o.deliveryPin,
    },
    items: detailItems,
    totals: orderTotals({
      items: detailItems,
      discount,
      shippingCharged: o.shippingCharged,
    }),
    history,
  };
}

/** A customer's orders (newest first) and their totals, for the customer page. */
export async function getCustomerOrders(
  customerId: string,
): Promise<{ orders: OrderSummary[]; stats: CustomerOrderStats }> {
  const list = await getOrders("", customerId, null);
  return { orders: list, stats: customerOrderStats(list) };
}
