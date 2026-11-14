import { paiseToInput } from "@/lib/money";
import { mmToCmInput } from "@/lib/units";
import type { ProductDetail } from "./queries";
import type { ProductInput } from "./schema";

const cm = (mm: number | null) => (mm === null ? "" : mmToCmInput(mm));

/** A saved product as the form's starting values (for editing or duplicating it). */
export function productToInput(product: ProductDetail): ProductInput {
  return {
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    typeId: product.typeId ?? "",
    colourId: product.colourId ?? "",
    designId: product.designId ?? "",
    length: cm(product.lengthMm),
    width: cm(product.widthMm),
    height: cm(product.heightMm),
    weight: product.weightG === null ? "" : String(product.weightG),
    price: paiseToInput(product.price),
    cost: paiseToInput(product.cost),
    optionIds: product.options.map((o) => o.id),
  };
}
