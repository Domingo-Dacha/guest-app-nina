import type {
  CartItem,
  ExtrasCatalog,
  ExtraService,
  Selection,
  StayContext,
} from "@/data/contracts/extras";

export class ExtrasError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function stayDates(stay: StayContext) {
  const dates: string[] = [];
  for (
    let date = stay.checkIn;
    date <= stay.checkOut && dates.length < 60;
    date = shiftDate(date, 1)
  )
    dates.push(date);
  return dates;
}
export function serviceFor(catalog: ExtrasCatalog, id: string): ExtraService {
  const service = catalog.services.find((s) => s.id === id);
  if (!service)
    throw new ExtrasError("INVALID_SERVICE", "Эта услуга больше недоступна.");
  return service;
}
export function dateReason(
  service: ExtraService,
  date: string,
  stay: StayContext,
  catalog: ExtrasCatalog,
  now: Date,
): string | null {
  if (!date) return "Выберите дату.";
  if (date < stay.checkIn || date > stay.checkOut)
    return "Выберите дату в пределах проживания.";
  if (service.id === "late-checkout" && date !== stay.checkOut)
    return "Поздний выезд возможен только в день окончания проживания.";
  const clock = localClock(now, catalog.rules.timeZone);
  if (date < clock.date) return "Эта дата уже прошла.";
  if (
    service.id === "breakfast" &&
    `${clock.date}T${clock.time}` >=
      `${shiftDate(date, -1)}T${catalog.rules.breakfastDeadline}`
  )
    return "Приём заказов на эту дату завершён";
  return null;
}
export function timeReason(
  service: ExtraService,
  date: string,
  time: string,
  stay: StayContext,
  catalog: ExtrasCatalog,
  now: Date,
): string | null {
  const invalidDate = dateReason(service, date, stay, catalog, now);
  if (invalidDate) return invalidDate;
  if (!service.times.includes(time)) return "Выберите время.";
  const start = time.slice(0, 5),
    end = time.slice(-5);
  const clock = localClock(now, catalog.rules.timeZone);
  if (date === clock.date && start <= clock.time)
    return "Это время уже прошло.";
  if (service.id === "late-checkout")
    return start > stay.checkOutTime
      ? null
      : "Выберите время после стандартного выезда.";
  if (date === stay.checkIn && start < stay.checkInTime)
    return "Это время раньше вашего заезда.";
  if (date === stay.checkOut && end > stay.checkOutTime)
    return "Это время позже вашего выезда.";
  return null;
}
export function validateSelection(
  item: Selection,
  stay: StayContext,
  catalog: ExtrasCatalog,
  now: Date,
): string | null {
  const service = serviceFor(catalog, item.serviceId);
  const reason = timeReason(service, item.date, item.time, stay, catalog, now);
  if (reason) return reason;
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > catalog.rules.maxSets ||
    (service.id !== "breakfast" && item.quantity !== 1)
  )
    return "Проверьте количество наборов.";
  if (item.decoration && !service.addon)
    return "Для этой услуги нет такого дополнения.";
  return null;
}
export function pricedItem(item: Selection, catalog: ExtrasCatalog): CartItem {
  const service = serviceFor(catalog, item.serviceId);
  return {
    ...item,
    unitPrice: service.price,
    addonPrice: item.decoration ? (service.addon?.price ?? 0) : 0,
  };
}
export const lineTotal = (item: CartItem) =>
  (item.unitPrice + item.addonPrice) * item.quantity;
export const cartTotal = (items: CartItem[]) =>
  items.reduce((sum, item) => sum + lineTotal(item), 0);
export function pricesChanged(items: CartItem[], catalog: ExtrasCatalog) {
  return items.some((item) => {
    const current = pricedItem(item, catalog);
    return (
      current.unitPrice !== item.unitPrice ||
      current.addonPrice !== item.addonPrice
    );
  });
}
export function validateCheckout(
  items: CartItem[],
  stay: StayContext,
  catalog: ExtrasCatalog,
  total: number,
  now: Date,
) {
  if (!items.length)
    throw new ExtrasError("EMPTY_CART", "Добавьте хотя бы одну услугу.");
  for (const item of items) {
    const reason = validateSelection(item, stay, catalog, now);
    if (reason)
      throw new ExtrasError(
        "UNAVAILABLE",
        `${serviceFor(catalog, item.serviceId).name}: ${reason}`,
      );
  }
  if (pricesChanged(items, catalog) || cartTotal(items) !== total)
    throw new ExtrasError(
      "PRICE_CHANGED",
      "Цены изменились. Проверьте новую сумму и подтвердите её перед оплатой.",
    );
}
export const money = (amount: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount / 100);
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
export const fulfillmentLabels = {
  awaiting_approval: "Ожидает согласования",
  confirmed: "Подтверждено",
  completed: "Выполнено",
  cancelled: "Отменено",
} as const;
export const paymentLabels = {
  paid: "Оплачено",
  refund_pending: "Возврат оформляется",
  refunded: "Возвращено",
} as const;
