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
  availableForStay,
  isNewYearHoliday,
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
  it("prices bath extensions and extras, uses date tariffs, and rejects unsupported hours and overruns", () => {
    const bath: Selection = {
      ...selection,
      serviceId: "bath-vensky",
      time: "16:00",
      durationHours: 3,
      robes: 2,
    };
    expect(cartTotal([pricedItem(bath, catalog)])).toBe(1150000);
    const special = structuredClone(catalog);
    special.services.find((s) => s.id === "bath-vensky")!.priceByDate = {
      "2026-10-17": 1000000,
    };
    expect(cartTotal([pricedItem(bath, special)])).toBe(1350000);
    expect(pricesChanged([pricedItem(bath, catalog)], special)).toBe(true);
    expect(validateSelection(bath, stay, catalog, before)).toBeNull();
    expect(
      validateSelection({ ...bath, durationHours: 13 }, stay, catalog, before),
    ).toContain("длительность");
    expect(
      validateSelection(
        { ...selection, durationHours: 3 },
        stay,
        catalog,
        before,
      ),
    ).toContain("длительность");
    expect(
      validateSelection(
        {
          ...bath,
          serviceId: "bath-vensky-furako",
          durationHours: 4,
          time: "21:00",
        },
        stay,
        catalog,
        before,
      ),
    ).toContain("завершиться");
    expect(
      validateSelection(
        { ...bath, date: stay.checkOut, time: "10:00" },
        stay,
        catalog,
        before,
      ),
    ).toContain("завершиться");
    const gavshino = serviceFor(catalog, "bath-gavshino");
    expect(
      timeReason(gavshino, bath.date, bath.time, stay, catalog, before),
    ).toBeNull();
    expect(
      validateSelection(
        { ...bath, serviceId: "bath-gavshino", durationHours: undefined },
        stay,
        catalog,
        before,
      ),
    ).toBeNull();
  });
  it("includes four bath hours in the package and requires the current standalone furako price", () => {
    const item: Selection = {
      ...selection,
      serviceId: "bath-vensky-furako",
      time: "16:00",
      durationHours: 4,
    };
    expect(validateSelection(item, stay, catalog, before)).toBeNull();
    expect(pricedItem(item, catalog).unitPrice).toBe(1300000);
    expect(pricedItem({ ...item, durationHours: 5 }, catalog).unitPrice).toBe(
      1550000,
    );
    for (const durationHours of [2, 3]) {
      const oldSelection = { ...item, durationHours };
      expect(validateSelection(oldSelection, stay, catalog, before)).toContain(
        "длительность",
      );
      expect(pricedItem(oldSelection, catalog).unitPrice).toBe(1300000);
      expect(() =>
        validateCheckout(
          [pricedItem(oldSelection, catalog)],
          stay,
          catalog,
          1300000,
          before,
        ),
      ).toThrow("длительность");
    }
    const standalone = pricedItem(
      { ...selection, serviceId: "furako-vensky", time: "16:00" },
      catalog,
    );
    expect(standalone.unitPrice).toBe(700000);
    const stalePrice = { ...standalone, unitPrice: 600000 };
    expect(() =>
      validateCheckout([stalePrice], stay, catalog, 600000, before),
    ).toThrow("Цены изменились");
  });
  it("applies the annual New Year tariff only from Dec 31 through Jan 10", () => {
    for (const [date, expected] of [
      ["2026-12-30", 800000],
      ["2026-12-31", 1000000],
      ["2027-01-01", 1000000],
      ["2027-01-10", 1000000],
      ["2027-01-11", 800000],
      ["2028-12-31", 1000000],
    ] as const) {
      expect(
        pricedItem(
          { ...selection, serviceId: "bath-vensky", date, time: "16:00" },
          catalog,
        ).unitPrice,
      ).toBe(expected);
      expect(isNewYearHoliday(date)).toBe(expected === 1000000);
    }
    expect(isNewYearHoliday("")).toBe(false);
    expect(
      pricedItem(
        { ...selection, serviceId: "bath-vensky-furako", date: "2027-01-10" },
        catalog,
      ).unitPrice,
    ).toBe(1500000);
    expect(
      pricedItem(
        { ...selection, serviceId: "bath-vensky-furako", date: "2027-01-11" },
        catalog,
      ).unitPrice,
    ).toBe(1300000);
    const holidayStay = {
      ...stay,
      checkIn: "2026-12-30",
      checkOut: "2027-01-11",
    };
    const holiday = {
      ...selection,
      serviceId: "bath-vensky" as const,
      date: "2026-12-31",
      time: "16:00",
      durationHours: 3,
      robes: 2,
    };
    expect(cartTotal([pricedItem(holiday, catalog)])).toBe(1350000);
    expect(() =>
      validateCheckout(
        [{ ...pricedItem(holiday, catalog), unitPrice: 1050000 }],
        holidayStay,
        catalog,
        1150000,
        before,
      ),
    ).toThrow("Цены изменились");
  });
  it("prices three-hour saunas and separate furako and preserves Meridian-only access", () => {
    for (const [serviceId, price] of [
      ["bath-gavshino", 750000],
      ["bath-paradise", 1000000],
    ] as const) {
      const choice = { ...selection, serviceId, time: "16:00", robes: 2 };
      expect(cartTotal([pricedItem(choice, catalog)])).toBe(price + 100000);
      expect(
        cartTotal([pricedItem({ ...choice, durationHours: 4 }, catalog)]),
      ).toBe(price + 350000);
      expect(
        validateSelection(
          { ...choice, durationHours: 2 },
          { ...stay, houseName: "Меридиан" },
          catalog,
          before,
        ),
      ).toContain("длительность");
      expect(
        validateSelection(
          choice,
          { ...stay, houseName: "Меридиан" },
          catalog,
          before,
        ),
      ).toBeNull();
    }
    expect(
      validateSelection(
        { ...selection, serviceId: "bath-paradise", time: "16:00" },
        stay,
        catalog,
        before,
      ),
    ).toContain("Меридиана");
    expect(
      cartTotal([
        pricedItem(
          {
            ...selection,
            serviceId: "furako-vensky",
            time: "16:00",
            robes: 2,
            decoration: true,
          },
          catalog,
        ),
      ]),
    ).toBe(1000000);
  });
  it("prices both furako days and independent optional extras without enabling them by default", () => {
    const bath: Selection = {
      ...selection,
      serviceId: "furako",
      date: "2026-10-16",
      time: "19:00",
      durationDays: 2,
    };
    expect(cartTotal([pricedItem(bath, catalog)])).toBe(800000);
    const full = { ...bath, decoration: true, fir: true, robes: 2 };
    expect(cartTotal([pricedItem(full, catalog)])).toBe(1300000);
    expect(validateSelection(full, stay, catalog, before)).toBeNull();
    expect(
      validateSelection({ ...full, date: "2026-10-17" }, stay, catalog, before),
    ).toContain("двух дней");
    expect(
      validateSelection({ ...selection, fir: true }, stay, catalog, before),
    ).toContain("дополнения");
    expect(
      validateSelection({ ...selection, robes: 1 }, stay, catalog, before),
    ).toContain("халатов");
    const old = pricedItem(full, catalog);
    const changed = structuredClone(catalog);
    changed.services.find((s) => s.id === "furako")!.robeAddon!.price = 60000;
    expect(pricesChanged([old], changed)).toBe(true);
  });
  it("blocks unpriced services and Meridian-only access even with forged selections", () => {
    expect(
      validateSelection(
        { ...selection, serviceId: "dinner" },
        stay,
        catalog,
        before,
      ),
    ).toContain("Стоимость уточняется");
    expect(
      validateSelection(
        { ...selection, serviceId: "lunch" },
        stay,
        catalog,
        before,
      ),
    ).toContain("Стоимость уточняется");
    const paradise = serviceFor(catalog, "bath-paradise");
    expect(availableForStay(paradise, stay)).toBe(false);
    expect(availableForStay(paradise, { ...stay, houseName: "Меридиан" })).toBe(
      true,
    );
    expect(
      validateSelection(
        { ...selection, serviceId: "bath-paradise" },
        stay,
        catalog,
        before,
      ),
    ).toContain("Меридиана");
  });
  it("blocks retired bicycles and external basket checkout while retaining historical prices", () => {
    const bikes: Selection = {
      ...selection,
      serviceId: "bicycles",
      time: "По согласованию",
      quantity: 2,
    };
    expect(validateSelection(bikes, stay, catalog, before)).toContain(
      "больше не доступна",
    );
    expect(() =>
      validateCheckout([pricedItem(bikes, catalog)], stay, catalog, 0, before),
    ).toThrow("больше не доступна");
    expect(
      validateSelection(
        { ...bikes, serviceId: "sup", date: stay.checkOut },
        stay,
        catalog,
        new Date("2026-10-18T09:00:00Z"),
      ),
    ).toContain("завершилось");
    expect(cartTotal([pricedItem(bikes, catalog)])).toBe(0);
    expect(
      validateSelection(
        { ...bikes, serviceId: "farm-basket" },
        stay,
        catalog,
        before,
      ),
    ).toContain("Telegram");
    expect(
      cartTotal([pricedItem({ ...bikes, serviceId: "sup" }, catalog)]),
    ).toBe(400000);
  });
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
      validateCheckout(items, stay, catalog, 90000, before),
    ).not.toThrow();
    expect(() =>
      validateCheckout(
        items,
        stay,
        catalog,
        90000,
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
    expect(cartTotal([pricedItem(bath, catalog)])).toBe(700000);
    expect(
      cartTotal([
        pricedItem({ ...bath, decoration: true }, catalog),
        pricedItem(selection, catalog),
      ]),
    ).toBe(990000);
    expect(
      cartTotal([pricedItem({ ...selection, quantity: 2 }, catalog)]),
    ).toBe(180000);
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
