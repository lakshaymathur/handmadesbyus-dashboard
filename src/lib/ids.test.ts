import { describe, expect, it } from "vitest";
import {
  formatCustomerId,
  formatOrderId,
  orderIdPrefix,
  parseCustomerId,
  parseOrderId,
} from "./ids";

describe("customer IDs", () => {
  it.each([
    [1, "C-0001"],
    [42, "C-0042"],
    [9999, "C-9999"],
    [10000, "C-10000"],
  ])("formats %i as %s", (seq, id) => {
    expect(formatCustomerId(seq)).toBe(id);
    expect(parseCustomerId(id)).toBe(seq);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses sequence %s", (seq) => {
    expect(() => formatCustomerId(seq)).toThrow(RangeError);
  });

  it.each([
    ["c-1", 1],
    ["C1", 1],
    [" C-0042 ", 42],
  ])("reads %j loosely", (text, seq) => {
    expect(parseCustomerId(text)).toBe(seq);
  });

  it.each(["C-0000", "C-", "X-0001", "C-12a", "HMU-2611-0001", ""])(
    "rejects %j",
    (text) => {
      expect(parseCustomerId(text)).toBeNull();
    },
  );
});

describe("order IDs", () => {
  const nov2026 = new Date("2026-11-13T06:00:00Z");

  it("uses the IST year and month", () => {
    expect(orderIdPrefix(nov2026)).toBe("HMU-2611");
    expect(formatOrderId(nov2026, 42)).toBe("HMU-2611-0042");
    expect(formatOrderId(nov2026, 12345)).toBe("HMU-2611-12345");
  });

  it("puts an order placed at 1 am IST on 1 Dec in December, not November", () => {
    // 2026-11-30T19:30Z is 01:00 on 1 Dec in India.
    expect(orderIdPrefix(new Date("2026-11-30T19:30:00Z"))).toBe("HMU-2612");
  });

  it("takes an order date (an IST calendar date) as well as a moment", () => {
    expect(orderIdPrefix("2026-12-01")).toBe("HMU-2612");
    expect(formatOrderId("2027-01-31", 3)).toBe("HMU-2701-0003");
    expect(() => orderIdPrefix("2026-02-30")).toThrow(RangeError);
  });

  it("refuses an invalid sequence", () => {
    expect(() => formatOrderId(nov2026, 0)).toThrow(RangeError);
  });

  it.each([
    ["HMU-2611-0042", { year: 2026, month: 11, seq: 42 }],
    ["hmu-2611-0042", { year: 2026, month: 11, seq: 42 }],
    ["HMU26110042", { year: 2026, month: 11, seq: 42 }],
    ["HMU-2701-12345", { year: 2027, month: 1, seq: 12345 }],
  ])("reads %j", (text, parts) => {
    expect(parseOrderId(text)).toEqual(parts);
  });

  it.each([
    "HMU-2613-0001",
    "HMU-2600-0001",
    "HMU-2611-0000",
    "HMU-2611-42",
    "ORD-2611-0042",
    "",
  ])("rejects %j", (text) => {
    expect(parseOrderId(text)).toBeNull();
  });

  it("round-trips", () => {
    expect(parseOrderId(formatOrderId(nov2026, 7))).toEqual({
      year: 2026,
      month: 11,
      seq: 7,
    });
  });
});
