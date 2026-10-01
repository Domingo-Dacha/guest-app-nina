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
export function availableForStay(service: ExtraService, stay: StayContext) {
  return (
    !service.allowedHouses ||
    service.allowedHouses.some(
      (name) =>
        name.toLocaleLowerCase("ru-RU") ===
        stay.houseName.trim().toLocaleLowerCase("ru-RU"),
    )
  );
}
export function serviceBlockReason(service: ExtraService, stay: StayContext) {
  if (!availableForStay(service, stay))
    return "Эта услуга доступна только для гостей «Меридиана».";
  if (service.price === null)
    return "Стоимость уточняется. Оформление пока недоступно.";
  return null;
}
export function dateReason(
  service: ExtraService,
  date: string,
  stay: StayContext,
  catalog: ExtrasCatalog,
  now: Date,
): string | null {
  const blocked = serviceBlockReason(service, stay);
  if (blocked) return blocked;
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
  if (service.timing === "agreement") {
    const clock = localClock(now, catalog.rules.timeZone);
    return date === stay.checkOut &&
      date === clock.date &&
      clock.time >= stay.checkOutTime
      ? "Проживание уже завершилось."
      : null;
  }
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
  const days = item.durationDays ?? 1;
  if (
    (days !== 1 && days !== 2) ||
    (days !== 1 && !service.durations?.some((d) => d.days === days))
  )
    return "Проверьте длительность услуги.";
  if (item.date && days > 1 && shiftDate(item.date, days - 1) >= stay.checkOut)
    return "Для двух дней фурако выберите дату раньше: оба дня должны быть до дня выезда.";
  const reason = timeReason(service, item.date, item.time, stay, catalog, now);
  if (reason) return reason;
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > catalog.rules.maxSets ||
    (!service.quantityLabel && item.quantity !== 1)
  )
    return "Проверьте количество наборов.";
  if (item.decoration && !service.addon)
    return "Для этой услуги нет такого дополнения.";
  if (item.fir && !service.firAddon)
    return "Для этой услуги нет такого дополнения.";
  if (
    !Number.isInteger(item.robes ?? 0) ||
    (item.robes ?? 0) < 0 ||
    (item.robes ?? 0) > catalog.rules.maxSets ||
    (item.robes && !service.robeAddon)
  )
    return "Проверьте количество халатов.";
  return null;
}
export function pricedItem(item: Selection, catalog: ExtrasCatalog): CartItem {
  const service = serviceFor(catalog, item.serviceId);
  return {
    ...item,
    durationDays: item.durationDays ?? 1,
    fir: item.fir ?? false,
    robes: item.robes ?? 0,
    unitPrice:
      service.durations?.find((d) => d.days === (item.durationDays ?? 1))
        ?.price ??
      service.price ??
      0,
    addonPrice: item.decoration ? (service.addon?.price ?? 0) : 0,
    firPrice: item.fir ? (service.firAddon?.price ?? 0) : 0,
    robePrice: item.robes ? (service.robeAddon?.price ?? 0) : 0,
  };
}
export const lineTotal = (item: CartItem) =>
  (item.unitPrice + item.addonPrice + (item.firPrice ?? 0)) * item.quantity +
  (item.robes ?? 0) * (item.robePrice ?? 0);
export const cartTotal = (items: CartItem[]) =>
  items.reduce((sum, item) => sum + lineTotal(item), 0);
export function pricesChanged(items: CartItem[], catalog: ExtrasCatalog) {
  return items.some((item) => {
    const current = pricedItem(item, catalog);
    return (
      current.unitPrice !== item.unitPrice ||
      current.addonPrice !== item.addonPrice ||
      current.firPrice !== (item.firPrice ?? 0) ||
      current.robePrice !== (item.robePrice ?? 0)
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
  not_required: "Без оплаты",
  refund_pending: "Возврат оформляется",
  refunded: "Возвращено",
} as const;
