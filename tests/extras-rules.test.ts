import { describe, expect, it } from "vitest";
import { extrasFixture as catalog } from "@/data/fixtures/extras";
import type { Selection, StayContext } from "@/data/contracts/extras";
import {
  cartTotal,
  dateReason,
  pricedItem,
  pricesChanged,
  serviceFor,
  timeReason,
  validateCheckout,
  validateSelection,
} from "@/lib/extras-rules";

const stay: StayContext = {
  id: "stay",
  guestName: "Тестовый гость",
  contact: "guest@example.test",
  houseName: "Дом у сосен",
  checkIn: "2026-10-16",
  checkOut: "2026-10-18",
  checkInTime: "15:00",
  checkOutTime: "12:00",
  guests: 4,
};
const selection: Selection = {
  id: "10000000-0000-4000-8000-000000000001",
  serviceId: "breakfast",
  date: "2026-10-17",
  time: "09:00–09:30",
  quantity: 1,
  decoration: false,
};
const before = new Date("2026-10-16T14:59:59Z");
describe("extras booking rules", () => {
  it("closes breakfast at 18:00 in the property's timezone, not the device timezone", () => {
    expect(validateSelection(selection, stay, catalog, before)).toBeNull();
    expect(
      validateSelection(
        selection,
        stay,
        catalog,
        new Date("2026-10-16T15:00:00Z"),
      ),
    ).toContain("Приём заказов");
    expect(
      validateSelection(
        selection,
        stay,
        catalog,
        new Date("2026-10-16T18:00:00+03:00"),
      ),
    ).toContain("Приём заказов");
  });
  it("checks the deadline again at checkout and leaves the cart unchanged", () => {
    const items = [pricedItem(selection, catalog)];
    expect(() =>
      validateCheckout(items, stay, catalog, 190000, before),
    ).not.toThrow();
    expect(() =>
      validateCheckout(
        items,
        stay,
        catalog,
        190000,
        new Date("2026-10-16T15:00:00Z"),
      ),
    ).toThrow("Приём заказов");
    expect(items).toHaveLength(1);
  });
  it("rejects times outside the stay, past times, incomplete choices and fake slots", () => {
    const bath = serviceFor(catalog, "furako");
    const early = new Date("2026-10-15T10:00:00Z");
    expect(
      timeReason(bath, stay.checkIn, "14:00", stay, catalog, early),
    ).toContain("раньше");
    expect(
      timeReason(bath, stay.checkOut, "13:00", stay, catalog, early),
    ).toContain("позже");
    expect(
      timeReason(
        bath,
        stay.checkIn,
        "18:00",
        stay,
        catalog,
        new Date("2026-10-16T15:00:00Z"),
      ),
    ).toContain("прошло");
    expect(
      timeReason(bath, stay.checkIn, "18:15", stay, catalog, early),
    ).toContain("Выберите время");
    expect(dateReason(bath, "2026-10-19", stay, catalog, early)).toContain(
      "пределах",
    );
    expect(
      validateSelection(
        { ...selection, date: "", time: "" },
        stay,
        catalog,
        early,
      ),
    ).toContain("дату");
  });
  it("allows late checkout only after the normal checkout on the departure date", () => {
    const late = serviceFor(catalog, "late-checkout");
    expect(
      timeReason(late, stay.checkOut, "15:00", stay, catalog, before),
    ).toBeNull();
    expect(
      timeReason(late, "2026-10-17", "15:00", stay, catalog, before),
    ).toContain("окончания");
    expect(
      timeReason(
        late,
        stay.checkOut,
        "15:00",
        stay,
        catalog,
        new Date("2026-10-18T12:00:00Z"),
      ),
    ).toContain("прошло");
  });
  it("prices only selected add-ons and quantities; rejects unsupported combinations", () => {
    const bath = { ...selection, serviceId: "furako" as const, time: "19:00" };
    expect(cartTotal([pricedItem(bath, catalog)])).toBe(600000);
    expect(
      cartTotal([
        pricedItem({ ...bath, decoration: true }, catalog),
        pricedItem(selection, catalog),
      ]),
    ).toBe(990000);
    expect(
      cartTotal([pricedItem({ ...selection, quantity: 2 }, catalog)]),
    ).toBe(380000);
    expect(
      validateSelection({ ...bath, quantity: 2 }, stay, catalog, before),
    ).toContain("количество");
    expect(
      validateSelection(
        { ...selection, decoration: true },
        stay,
        catalog,
        before,
      ),
    ).toContain("дополнения");
  });
  it("requires fresh prices even if a manipulated total matches", () => {
    const item = pricedItem(selection, catalog);
    const changed = structuredClone(catalog);
    changed.services.find((s) => s.id === "breakfast")!.price = 200000;
    expect(pricesChanged([item], changed)).toBe(true);
    expect(() =>
      validateCheckout([item], stay, changed, 200000, before),
    ).toThrow("Цены изменились");
    expect(() => validateCheckout([item], stay, catalog, 1, before)).toThrow(
      "Цены изменились",
    );
  });
});
