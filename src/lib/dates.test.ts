import { describe, expect, it } from "vitest";
import {
  dateOnlyField,
  formatDate,
  formatDateOnly,
  formatDateTime,
  isDateOnly,
  istYearMonth,
  parseDisplayDate,
  toDateOnly,
  todayIST,
} from "./dates";

// 20:00 UTC is 01:30 the next day in India (UTC+05:30): the classic off-by-one trap.
const lateEveningUtc = new Date("2026-11-12T20:00:00Z");

describe("moments shown in IST", () => {
  it("formats as DD/MM/YYYY on the Indian calendar day", () => {
    expect(formatDate(lateEveningUtc)).toBe("13/11/2026");
    expect(formatDate(new Date("2026-11-12T18:29:59Z"))).toBe("12/11/2026");
  });

  it("formats date and time in IST", () => {
    expect(formatDateTime(lateEveningUtc)).toBe("13/11/2026, 1:30 am");
    expect(formatDateTime(new Date("2026-11-13T10:15:00Z"))).toBe(
      "13/11/2026, 3:45 pm",
    );
  });

  it("converts a moment to its IST calendar date", () => {
    expect(toDateOnly(lateEveningUtc)).toBe("2026-11-13");
    expect(todayIST(lateEveningUtc)).toBe("2026-11-13");
  });

  it("gives the IST year and month, across a month and year boundary", () => {
    expect(istYearMonth(new Date("2026-12-31T19:00:00Z"))).toEqual({
      year: 2027,
      month: 1,
    });
    expect(istYearMonth(new Date("2026-12-31T18:00:00Z"))).toEqual({
      year: 2026,
      month: 12,
    });
  });

  it("rejects invalid dates instead of printing 'Invalid Date'", () => {
    expect(() => formatDate(new Date("nope"))).toThrow(RangeError);
    expect(() => toDateOnly(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("calendar dates", () => {
  it("formats YYYY-MM-DD as DD/MM/YYYY without any time-zone shift", () => {
    expect(formatDateOnly("2026-11-13")).toBe("13/11/2026");
    expect(formatDateOnly("2026-01-01")).toBe("01/01/2026");
  });

  it.each(["2026-02-28", "2028-02-29", "2026-12-31"])("accepts %s", (d) => {
    expect(isDateOnly(d)).toBe(true);
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-1-1",
    "13/11/2026",
    "",
  ])("rejects %j", (d) => {
    expect(isDateOnly(d)).toBe(false);
  });

  it("refuses to format an invalid calendar date", () => {
    expect(() => formatDateOnly("2026-02-30")).toThrow(RangeError);
  });
});

describe("parseDisplayDate (day first, as written in India)", () => {
  it.each([
    ["13/11/2026", "2026-11-13"],
    ["3/1/2026", "2026-01-03"],
    ["03-01-2026", "2026-01-03"],
    ["29.02.2028", "2028-02-29"],
    [" 1/12/2026 ", "2026-12-01"],
  ])("reads %j as %s", (text, iso) => {
    expect(parseDisplayDate(text)).toBe(iso);
  });

  it.each([
    "29/02/2026",
    "31/04/2026",
    "11/13/2026",
    "2026-11-13",
    "13/11/26",
    "",
    "soon",
  ])("rejects %j", (text) => {
    expect(parseDisplayDate(text)).toBeNull();
  });
});

describe("dateOnlyField", () => {
  it("accepts an <input type=date> value and rejects impossible dates", () => {
    expect(dateOnlyField().parse("2026-11-13")).toBe("2026-11-13");
    expect(dateOnlyField().safeParse("2026-02-30").success).toBe(false);
  });
});
