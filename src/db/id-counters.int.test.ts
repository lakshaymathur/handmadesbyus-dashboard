import { describe, expect, it } from "vitest";
import { db } from "./client";
import { nextCustomerNumber, nextOrderCode } from "./id-counters";

describe("readable ID counters", () => {
  it("counts customers from 1", async () => {
    expect(await nextCustomerNumber(db)).toBe(1);
    expect(await nextCustomerNumber(db)).toBe(2);
    expect(await nextCustomerNumber(db)).toBe(3);
  });

  it("numbers orders per month of the order date", async () => {
    expect(await nextOrderCode(db, "2026-11-14")).toBe("HMU-2611-0001");
    expect(await nextOrderCode(db, "2026-11-30")).toBe("HMU-2611-0002");
    expect(await nextOrderCode(db, "2026-12-01")).toBe("HMU-2612-0001");
    // A back-dated order continues its own month's series.
    expect(await nextOrderCode(db, "2026-11-02")).toBe("HMU-2611-0003");
  });

  it("never hands out the same number to concurrent callers", async () => {
    // More callers than pool connections, each in its own transaction.
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () =>
        db.transaction((tx) => nextCustomerNumber(tx)),
      ),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it("gives the number back when the transaction that took it fails", async () => {
    expect(await nextCustomerNumber(db)).toBe(1);
    await expect(
      db.transaction(async (tx) => {
        expect(await nextCustomerNumber(tx)).toBe(2);
        throw new Error("customer insert failed");
      }),
    ).rejects.toThrow("customer insert failed");
    expect(await nextCustomerNumber(db)).toBe(2);
  });
});
