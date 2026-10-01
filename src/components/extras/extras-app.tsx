"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShoppingBag,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { farmBasketLink, farmBasketMessage } from "@/lib/farm-basket-order";
import type {
  ExtraOrder,
  ExtrasCatalog,
  ExtrasCommand,
  ExtrasSnapshot,
  Selection,
  StayContext,
} from "@/data/contracts/extras";
import {
  cartTotal,
  dateReason,
  money,
  pricedItem,
  repriceItem,
  quantityLimit,
  pricesChanged,
  serviceFor,
  shortDate,
  stayDates,
  timeReason,
  validateSelection,
  availableForStay,
  serviceBlockReason,
  isNewYearHoliday,
} from "@/lib/extras-rules";
import {
  ItemSummary,
  OrderDetails,
  ServiceArt,
  ServicePhoto,
} from "./extras-parts";

type Props = { catalog: ExtrasCatalog; stay: StayContext; initialNow: string };
export function ExtrasApp(props: Props) {
  const router = useRouter(),
    search = useSearchParams();
  const view = search.get("view") ?? "catalog",
    requestedCategory = search.get("category") ?? "all";
  const [data, setData] = useState<ExtrasSnapshot | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Selection>>({});
  const [comment, setComment] = useState("");
  const [savedOrder, setSavedOrder] = useState<ExtraOrder | null>(null);
  const [now, setNow] = useState(new Date(props.initialNow));
  const clockOffset = useRef(0),
    locked = useRef(false),
    checkoutKeys = useRef<Record<number, string>>({});
  const scrollPositions = useRef<Record<string, number>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const catalog = data?.catalog ?? props.catalog,
    stay = data?.stay ?? props.stay;
  const cart = data?.cart ?? { version: 0, items: [] },
    total = cartTotal(cart.items);
  const service = catalog.services.find(
    (s) => s.id === search.get("service") && !s.retired,
  );
  const editId = search.get("edit"),
    draftKey = editId ?? service?.id ?? "";
  const existing = cart.items.find((item) => item.id === editId);
  const draft: Selection | null = service
    ? (drafts[draftKey] ??
      (existing ? repriceItem(existing, catalog) : null) ?? {
        id: "",
        serviceId: service.id,
        date: service.id === "late-checkout" ? stay.checkOut : "",
        time: "",
        quantity: 1,
        decoration: false,
        durationDays: 1,
        fir: false,
        robes: 0,
      })
    : null;
  const formReason = draft
    ? validateSelection(draft, stay, catalog, now)
    : null;
  const blockedService = service ? serviceBlockReason(service, stay) : null;
  const visibleServices = catalog.services.filter(
    (s) => !s.retired && availableForStay(s, stay),
  );
  const category = visibleServices.some((s) => s.category === requestedCategory)
    ? requestedCategory
    : "all";
  const stalePrices = pricesChanged(cart.items, catalog);
  const cartIssues = cart.items
    .map((item) => ({
      id: item.id,
      reason: validateSelection(item, stay, catalog, now),
    }))
    .filter((item) => item.reason);
  const order =
    data?.orders.find((o) => o.id === search.get("order")) ??
    (savedOrder?.id === search.get("order") ? savedOrder : null);
  const refresh = useCallback((): Promise<ExtrasSnapshot | null> => {
    return fetch("/api/extras", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        const snapshot = payload as ExtrasSnapshot;
        clockOffset.current = Date.parse(snapshot.serverNow) - Date.now();
        setNow(new Date(snapshot.serverNow));
        setData(snapshot);
        return snapshot;
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Не удалось загрузить услуги.",
        );
        return null;
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (!locked.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(
      () => setNow(new Date(Date.now() + clockOffset.current)),
      30000,
    );
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);
  const locationKey = search.toString();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({
        top: scrollPositions.current[locationKey] ?? 0,
        behavior: "instant",
      });
    });
    const saveScroll = () => {
      scrollPositions.current[locationKey] = window.scrollY;
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", saveScroll);
    };
  }, [locationKey]);
  function go(
    next: string,
    fields: Record<string, string> = {},
    replace = false,
  ) {
    if (locked.current) return;
    const params = new URLSearchParams({ view: next, category, ...fields });
    setError("");
    router[replace ? "replace" : "push"](`/extras?${params}`, {
      scroll: false,
    });
  }
  function updateDraft(change: Partial<Selection>) {
    if (!draft) return;
    setDrafts((previous) => ({
      ...previous,
      [draftKey]: { ...draft, id: draft.id || crypto.randomUUID(), ...change },
    }));
  }
  async function mutate(
    command: ExtrasCommand,
  ): Promise<{ order: ExtraOrder | null } | null> {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const payload = await response.json();
      if (!response.ok) {
        await refresh();
        throw new Error(payload.error || "Не удалось сохранить изменения.");
      }
      if (payload.order) setSavedOrder(payload.order as ExtraOrder);
      await refresh();
      return payload;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Нет связи с сервером. Корзина сохранена. Попробуйте ещё раз.",
      );
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function addToCart() {
    if (!draft || formReason || !data) return;
    const result = await mutate({
      action: "save",
      version: cart.version,
      item: draft,
    });
    if (result) {
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[draftKey];
        return next;
      });
      go(editId ? "cart" : "catalog");
      setNotice(
        editId ? "Изменения сохранены." : "Услуга добавлена в корзину.",
      );
    }
  }
  async function pay() {
    if (!data || !cart.items.length) return;
    checkoutKeys.current[cart.version] ??= crypto.randomUUID();
    const result = await mutate({
      action: "checkout",
      version: cart.version,
      total,
      comment,
      key: checkoutKeys.current[cart.version],
    });
    if (result?.order) {
      setComment("");
      go("result", { order: result.order.id, outcome: "success" }, true);
    }
  }
  const title =
    view === "catalog"
      ? "Допуслуги"
      : view === "service"
        ? (service?.name ?? "Услуга недоступна")
        : view === "cart"
          ? "Корзина"
          : view === "checkout"
            ? "Оформление"
            : view === "payment"
              ? "Демонстрационная оплата"
              : view === "orders"
                ? "Мои заказы"
                : view === "order"
                  ? `Заказ ${order?.number ?? ""}`
                  : view === "result"
                    ? search.get("outcome") === "success"
                      ? "Спасибо, заказ сохранён"
                      : search.get("outcome") === "cancelled"
                        ? "Оплата отменена"
                        : "Оплата не прошла"
                    : "Допуслуги";
  const backView =
    view === "service" && editId
      ? "cart"
      : view === "checkout"
        ? "cart"
        : view === "payment"
          ? "checkout"
          : view === "order"
            ? "orders"
            : "catalog";

  return (
    <div className="extras-page" aria-busy={busy}>
      <div className="extras-toolbar">
        {view === "catalog" ? (
          <Link className="extras-back" href="/">
            <ArrowLeft size={18} aria-hidden="true" /> К проживанию
          </Link>
        ) : (
          <button
            className="extras-back"
            disabled={busy}
            onClick={() => go(backView)}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Назад
          </button>
        )}
        <button
          className="extras-back"
          disabled={busy}
          onClick={() => go("orders")}
        >
          <ClipboardList size={18} aria-hidden="true" /> Мои заказы
        </button>
      </div>
      <header className="extras-heading">
        <p className="eyebrow">Больше времени для отдыха</p>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p>Для вашего отдыха в доме «{stay.houseName}»</p>
        <p className="extras-stay">
          {stay.guestName} · {shortDate(stay.checkIn)} —{" "}
          {shortDate(stay.checkOut)} · гостей: {stay.guests}
        </p>
      </header>
      <div className="extras-demo">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>Демонстрационный режим · без настоящих списаний</span>
      </div>
      {loading && (
        <p role="status" className="extras-note">
          Загружаем корзину и заказы…
        </p>
      )}
      {error && (
        <div role="alert" className="extras-feedback">
          <Alert tone="danger">{error}</Alert>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Обновить данные
          </Button>
        </div>
      )}
      {notice && (
        <div role="status" className="extras-feedback">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {data && !data.writable && (
        <Alert tone="warning">
          В этой версии доступен только просмотр. Оформление выключено.
        </Alert>
      )}

      {view === "catalog" && (
        <>
          <div className="extras-categories" aria-label="Категории услуг">
            {[
              { id: "all", name: "Все" },
              ...catalog.categories.filter((c) =>
                visibleServices.some((s) => s.category === c.id),
              ),
            ].map((c) => (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                onClick={() => go("catalog", { category: c.id }, true)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="extras-catalog">
            {visibleServices
              .filter((s) => category === "all" || s.category === category)
              .map((s) => (
                <article className="extras-service-card" key={s.id}>
                  <ServiceArt service={s} />
                  <div className="extras-service-card__body">
                    <p className="eyebrow">
                      {
                        catalog.categories.find((c) => c.id === s.category)
                          ?.name
                      }
                    </p>
                    <h2>{s.name}</h2>
                    <p>{s.summary}</p>
                    <p className="extras-note">
                      {s.telegramOrder
                        ? "Доставка от фермы «МАРГО»"
                        : s.confirmation === "manual"
                          ? "Время по согласованию"
                          : "Заказ до 18:00 накануне"}
                    </p>
                    <div className="extras-card-action">
                      {!s.telegramOrder && (
                        <div>
                          <strong>
                            {s.price === null
                              ? "Стоимость уточняется"
                              : s.price === 0
                                ? "Бесплатно"
                                : money(s.price)}
                          </strong>
                          <span>{s.unit}</span>
                        </div>
                      )}
                      <Button
                        aria-label={`Выбрать: ${s.name}`}
                        onClick={() => go("service", { service: s.id })}
                      >
                        Выбрать <ArrowRight size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          {!visibleServices.some(
            (s) => category === "all" || s.category === category,
          ) && (
            <div className="empty-state">
              <p>В этой категории пока нет услуг.</p>
              <Button
                variant="secondary"
                onClick={() => go("catalog", { category: "all" }, true)}
              >
                Все услуги
              </Button>
            </div>
          )}
        </>
      )}

      {view === "service" && service && draft && (
        <div className="extras-detail">
          <div>
            <ServiceArt service={service} />
            {service.images && service.images.length > 1 && (
              <div className="extras-photo-secondary">
                <ServiceArt service={service} photo={1} />
              </div>
            )}
            <div className="extras-detail-copy">
              {service.description.split("\n\n").map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {service.includes.length > 0 && <h2>Что входит</h2>}
              <ul>
                {service.includes.map((text) => (
                  <li key={text}>
                    <Check size={18} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
              <Alert
                tone={service.confirmation === "manual" ? "warning" : "info"}
              >
                {service.conditions}
              </Alert>
            </div>
          </div>
          {service.telegramOrder ? (
            <div className="extras-panel extras-form">
              <h2>Заказ у фермы «МАРГО»</h2>
              <p>
                Откроется чат с Марго. Название дома уже добавлено в сообщение:
              </p>
              <p className="extras-comment">{farmBasketMessage(stay)}</p>
              <a
                className="button button--primary"
                href={farmBasketLink(service.telegramOrder.username, stay)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Заказать
              </a>
              <p className="extras-note">
                Отправьте сообщение в Telegram. Марго подтвердит стоимость и
                доставку в переписке.
              </p>
            </div>
          ) : blockedService &&
            !(
              service.category === "bath" && availableForStay(service, stay)
            ) ? (
            <div className="extras-panel">
              <h2>
                {service.price === null
                  ? "Стоимость уточняется"
                  : "Услуга недоступна"}
              </h2>
              <p>{blockedService}</p>
            </div>
          ) : (
            <form
              className="extras-panel extras-form"
              onSubmit={(event) => {
                event.preventDefault();
                void addToCart();
              }}
            >
              <div className="extras-base-price">
                <strong>
                  {service.price === null
                    ? "Стоимость уточняется"
                    : service.price === 0
                      ? "Бесплатно"
                      : money(pricedItem(draft, catalog).unitPrice)}
                </strong>
                <span>
                  {service.durations
                    ? draft.durationDays === 2
                      ? "за 2 дня"
                      : "за 1 день"
                    : service.hourly
                      ? `баня ${draft.durationHours ?? service.hourly.included} ч${service.sessionHours ? ` + фурако ${service.sessionHours} ч` : ""}`
                      : service.unit}
                </span>
              </div>
              {service.newYearPrice !== undefined && (
                <p className="extras-note">
                  {isNewYearHoliday(draft.date)
                    ? "Применён новогодний тариф. "
                    : ""}
                  С 31 декабря по 10 января включительно —{" "}
                  {money(service.newYearPrice)} за{" "}
                  {service.hourly?.included ?? service.sessionHours} ч бани
                  {service.sessionHours
                    ? ` и ${service.sessionHours} ч фурако`
                    : ""}
                  .
                </p>
              )}
              {service.hourly && (
                <>
                  <label htmlFor="extra-hours">Длительность бани</label>
                  <select
                    id="extra-hours"
                    value={draft.durationHours ?? service.hourly.included}
                    disabled={busy}
                    onChange={(event) =>
                      updateDraft({ durationHours: Number(event.target.value) })
                    }
                  >
                    {Array.from(
                      {
                        length:
                          service.hourly.max - service.hourly.included + 1,
                      },
                      (_, n) => n + service.hourly!.included,
                    ).map((hours) => (
                      <option key={hours} value={hours}>
                        {hours} ч
                      </option>
                    ))}
                  </select>
                  <p className="extras-note">
                    Включено {service.hourly.included} ч; каждый дополнительный
                    час — {money(service.hourly.extraHourPrice)}.
                  </p>
                </>
              )}
              {service.packageServiceId && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    const target = serviceFor(
                      catalog,
                      service.packageServiceId!,
                    );
                    setDrafts((previous) => ({
                      ...previous,
                      [editId ?? target.id]: {
                        ...draft,
                        id: draft.id || crypto.randomUUID(),
                        serviceId: target.id,
                      },
                    }));
                    go("service", {
                      service: target.id,
                      ...(editId ? { edit: editId } : {}),
                    });
                  }}
                >
                  Добавить фурако на 4 часа · +
                  {money(
                    pricedItem(
                      { ...draft, serviceId: service.packageServiceId },
                      catalog,
                    ).unitPrice - pricedItem(draft, catalog).unitPrice,
                  )}
                </Button>
              )}
              {service.durations && (
                <>
                  <label htmlFor="extra-duration">Длительность</label>
                  <select
                    id="extra-duration"
                    value={draft.durationDays ?? 1}
                    disabled={busy}
                    onChange={(event) =>
                      updateDraft({
                        durationDays: Number(event.target.value) as 1 | 2,
                      })
                    }
                  >
                    {service.durations.map((d) => (
                      <option key={d.days} value={d.days}>
                        {d.days === 1 ? "1 день" : "2 дня"} · {money(d.price)}
                      </option>
                    ))}
                  </select>
                  <p className="extras-note">
                    Для двух дней оба дня купания должны быть до дня выезда.
                  </p>
                </>
              )}
              <label htmlFor="extra-date">
                {service.id === "late-checkout" ? "День выезда" : "Дата"}
              </label>
              <select
                id="extra-date"
                required
                value={draft.date}
                disabled={busy || service.id === "late-checkout"}
                onChange={(event) =>
                  updateDraft({
                    date: event.target.value,
                    time:
                      service.timing === "agreement" ? "По согласованию" : "",
                  })
                }
              >
                <option value="">Выберите дату</option>
                {stayDates(stay).map((date) => {
                  const reason = dateReason(service, date, stay, catalog, now);
                  const noTimes = !service.times.some(
                    (time) =>
                      !timeReason(service, date, time, stay, catalog, now),
                  );
                  return (
                    <option
                      key={date}
                      value={date}
                      disabled={Boolean(reason) || noTimes}
                    >
                      {shortDate(date)}
                      {reason
                        ? ` — ${reason}`
                        : noTimes
                          ? " — нет времени в пределах проживания"
                          : ""}
                    </option>
                  );
                })}
              </select>
              {service.id === "late-checkout" && (
                <p className="extras-note">
                  Стандартный выезд — в {stay.checkOutTime}. Запросите более
                  позднее время.
                </p>
              )}
              {service.timing === "agreement" ? (
                <p className="extras-note">
                  Время и длительность — по согласованию.
                </p>
              ) : (
                <>
                  <label htmlFor="extra-time">
                    {service.id === "breakfast"
                      ? "Интервал доставки"
                      : service.id === "furako"
                        ? "Желаемое время готовности"
                        : service.id === "late-checkout"
                          ? "Желаемое время выезда"
                          : "Желаемое время начала"}
                  </label>
                  <select
                    id="extra-time"
                    required
                    value={draft.time}
                    disabled={busy || !draft.date}
                    onChange={(event) =>
                      updateDraft({ time: event.target.value })
                    }
                  >
                    <option value="">Выберите время</option>
                    {service.times.map((time) => {
                      const reason = timeReason(
                        service,
                        draft.date,
                        time,
                        stay,
                        catalog,
                        now,
                      );
                      return (
                        <option
                          key={time}
                          value={time}
                          disabled={Boolean(reason)}
                        >
                          {time}
                          {reason && draft.date ? ` — ${reason}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  <p className="extras-note">Время объекта — московское.</p>
                  {service.category === "bath" && (
                    <p className="extras-note">
                      Вы выбираете желаемое время. Посещение требует
                      подтверждения.
                    </p>
                  )}
                </>
              )}
              {service.quantityLabel && (
                <>
                  <label htmlFor="extra-quantity">
                    {service.quantityLabel}
                  </label>
                  <select
                    id="extra-quantity"
                    value={draft.quantity}
                    disabled={busy}
                    onChange={(event) =>
                      updateDraft({ quantity: Number(event.target.value) })
                    }
                  >
                    {Array.from(
                      { length: quantityLimit(service, catalog) },
                      (_, n) => (
                        <option key={n + 1} value={n + 1}>
                          {n + 1}
                        </option>
                      ),
                    )}
                  </select>
                </>
              )}
              {service.addon && (
                <label className="extras-addon">
                  <input
                    type="checkbox"
                    checked={draft.decoration}
                    disabled={busy}
                    onChange={(event) =>
                      updateDraft({ decoration: event.target.checked })
                    }
                  />
                  <span>
                    {service.addon.name}
                    <small>+{money(service.addon.price)}</small>
                  </span>
                </label>
              )}
              {service.firAddon && (
                <>
                  {service.firAddon.image && (
                    <ServicePhoto picture={service.firAddon.image} />
                  )}
                  <label className="extras-addon">
                    <input
                      type="checkbox"
                      checked={draft.fir ?? false}
                      disabled={busy}
                      onChange={(event) =>
                        updateDraft({ fir: event.target.checked })
                      }
                    />
                    <span>
                      {service.firAddon.name}
                      <small>+{money(service.firAddon.price)}</small>
                    </span>
                  </label>
                </>
              )}
              {service.robeAddon && (
                <>
                  {service.robeAddon.image && (
                    <ServicePhoto picture={service.robeAddon.image} />
                  )}
                  <label htmlFor="extra-robes">
                    Халаты · {money(service.robeAddon.price)} за штуку
                  </label>
                  <select
                    id="extra-robes"
                    disabled={busy}
                    value={draft.robes ?? 0}
                    onChange={(event) =>
                      updateDraft({ robes: Number(event.target.value) })
                    }
                  >
                    <option value="0">Без халатов</option>
                    {Array.from({ length: catalog.rules.maxSets }, (_, n) => (
                      <option key={n + 1} value={n + 1}>
                        {n + 1}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {formReason && (
                <p className="extras-note" role="status">
                  {formReason}
                </p>
              )}
              {service.price === null ? (
                <p className="extras-note">
                  Можно выбрать пожелания по дате, времени и халатам. Пока
                  стоимость не определена, выбор не отправляется и оформление
                  недоступно.
                </p>
              ) : (
                <Button
                  type="submit"
                  disabled={busy || !data?.writable || Boolean(formReason)}
                >
                  {busy
                    ? "Сохраняем…"
                    : `${editId ? "Сохранить изменения" : "Добавить в корзину"} · ${money(cartTotal([pricedItem(draft, catalog)]))}`}
                </Button>
              )}
            </form>
          )}
        </div>
      )}

      {(view === "cart" || view === "checkout") && (
        <>
          {!cart.items.length ? (
            !loading && (
              <div className="empty-state">
                <ShoppingBag size={32} aria-hidden="true" />
                <h2>Пока ничего не выбрано</h2>
                <p>Добавьте то, что сделает ваш отдых приятнее.</p>
                <Button onClick={() => go("catalog")}>Выбрать услуги</Button>
              </div>
            )
          ) : (
            <div className="extras-checkout-grid">
              <div className="extras-stack">
                {cart.items.map((item) => (
                  <article className="extras-panel" key={item.id}>
                    <ItemSummary item={item} catalog={catalog} />
                    {serviceFor(catalog, item.serviceId).confirmation ===
                      "manual" && (
                      <p className="extras-pending">
                        Время и наличие требуют согласования. После оформления
                        менеджер свяжется с вами.
                      </p>
                    )}
                    {cartIssues.find((i) => i.id === item.id)?.reason && (
                      <Alert tone="danger">
                        {cartIssues.find((i) => i.id === item.id)!.reason}
                      </Alert>
                    )}
                    <div className="extras-actions">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setDrafts((previous) => ({
                            ...previous,
                            [item.id]: repriceItem(item, catalog),
                          }));
                          go("service", {
                            service: item.serviceId,
                            edit: item.id,
                          });
                        }}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy || !data?.writable}
                        onClick={() =>
                          void mutate({
                            action: "remove",
                            version: cart.version,
                            id: item.id,
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="extras-panel extras-summary">
                {view === "checkout" && (
                  <>
                    <h2>Данные проживания</h2>
                    <p>
                      {stay.guestName}
                      <br />
                      {stay.houseName}
                      <br />
                      Гостей: {stay.guests}
                    </p>
                    <p className="extras-note">
                      Контакт из проживания: {stay.contact}
                      <br />
                      Это вымышленный контакт для демонстрации.
                    </p>
                    <label htmlFor="extra-comment">
                      Комментарий — необязательно
                    </label>
                    <textarea
                      id="extra-comment"
                      maxLength={1000}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      disabled={busy}
                      placeholder="Что нам учесть? Не указывайте личные данные."
                    />
                  </>
                )}
                {stalePrices && (
                  <>
                    <Alert tone="warning">
                      Цены изменились. Новая сумма:{" "}
                      {money(
                        cartTotal(
                          cart.items.map((item) => repriceItem(item, catalog)),
                        ),
                      )}
                      . Подтвердите её перед оплатой.
                      {cart.items.some(
                        (item) =>
                          item.serviceId === "breakfast" &&
                          (item.servingsPerUnit ?? 2) === 2,
                      ) &&
                        " Завтрак теперь считается за человека; количество порций в старой корзине сохраняется."}
                    </Alert>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          action: "reprice",
                          version: cart.version,
                        })
                      }
                    >
                      Принять новую сумму
                    </Button>
                  </>
                )}
                <div className="extras-total">
                  <span>Итого</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="extras-note">
                  Все суммы демонстрационные. Банковская карта не нужна.
                </p>
                <Button
                  disabled={
                    busy ||
                    !data?.writable ||
                    stalePrices ||
                    cartIssues.length > 0
                  }
                  onClick={async () => {
                    if (view === "cart") go("checkout");
                    else if (
                      await mutate({
                        action: "review",
                        version: cart.version,
                        total,
                      })
                    ) {
                      if (total === 0) await pay();
                      else go("payment");
                    }
                  }}
                >
                  {busy
                    ? "Проверяем…"
                    : view === "cart"
                      ? "К оформлению"
                      : total === 0
                        ? "Оформить бесплатно"
                        : "Перейти к демооплате"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {view === "payment" && (
        <div className="extras-panel extras-payment">
          <ShieldCheck size={36} aria-hidden="true" />
          <h2>Проверим оформление без списания</h2>
          <p>
            Это демонстрационный сценарий. Выберите результат оплаты. Данные
            карты не запрашиваются.
          </p>
          <div className="extras-total">
            <span>Сумма</span>
            <strong>{money(total)}</strong>
          </div>
          {cartIssues.length > 0 && (
            <Alert tone="warning">
              Параметры одной из услуг больше недоступны. Вернитесь к оформлению
              и проверьте корзину.
            </Alert>
          )}
          {stalePrices && (
            <Alert tone="warning">
              Цены изменились. Вернитесь к оформлению, чтобы принять новую
              сумму.
            </Alert>
          )}
          {!cart.items.length && (
            <p>
              Корзина пуста. Если вы уже оплатили заказ, он находится в разделе
              «Мои заказы».
            </p>
          )}
          <Button
            disabled={
              busy ||
              !data?.writable ||
              !cart.items.length ||
              stalePrices ||
              cartIssues.length > 0
            }
            onClick={() => void pay()}
          >
            {busy ? "Сохраняем заказ…" : "Успешная демооплата"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => go("result", { outcome: "error" })}
          >
            Проверить ошибку оплаты
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => go("result", { outcome: "cancelled" })}
          >
            Отменить оплату
          </Button>
        </div>
      )}

      {view === "result" &&
        (search.get("outcome") === "success" ? (
          order ? (
            <>
              <div className="extras-success" role="status">
                <Check size={26} aria-hidden="true" />
                <div>
                  <h2>{order.number}</h2>
                  <p>
                    {order.total === 0
                      ? "Бесплатная заявка сохранена. Наличие и время требуют согласования."
                      : "Оплата в демонстрационном режиме прошла. Заказ сохранён."}
                  </p>
                </div>
              </div>
              <OrderDetails order={order} catalog={catalog} />
              <div className="extras-actions">
                <Button onClick={() => go("order", { order: order.id })}>
                  Посмотреть заказ
                </Button>
                <Button variant="secondary" onClick={() => go("catalog")}>
                  Вернуться к услугам
                </Button>
              </div>
            </>
          ) : (
            !loading && (
              <Alert tone="warning">
                Не удалось найти заказ. Откройте «Мои заказы» или обновите
                данные.
              </Alert>
            )
          )
        ) : (
          <div className="extras-panel extras-payment">
            <Alert
              tone={search.get("outcome") === "cancelled" ? "info" : "danger"}
            >
              {search.get("outcome") === "cancelled"
                ? "Вы отменили демонстрационную оплату."
                : "Демонстрационная ошибка оплаты. Можно попробовать ещё раз."}{" "}
              Корзина сохранена, списаний не было.
            </Alert>
            <Button onClick={() => go("checkout")}>
              Вернуться к оформлению
            </Button>
            <Button variant="secondary" onClick={() => go("catalog")}>
              Вернуться к услугам
            </Button>
          </div>
        ))}

      {view === "orders" && (
        <div className="extras-stack">
          {data?.orders.length
            ? data.orders.map((o) => (
                <article key={o.id} className="extras-panel">
                  <div className="extras-between">
                    <h2>{o.number}</h2>
                    <strong>{money(o.total)}</strong>
                  </div>
                  <p>
                    {new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "long",
                      timeZone: catalog.rules.timeZone,
                    }).format(new Date(o.createdAt))}
                  </p>
                  <p>{o.items.map((i) => i.name).join(" · ")}</p>
                  <Button
                    variant="secondary"
                    onClick={() => go("order", { order: o.id })}
                  >
                    Посмотреть заказ
                  </Button>
                </article>
              ))
            : !loading && (
                <div className="empty-state">
                  <h2>У вас пока нет заказов</h2>
                  <p>После успешного оформления заказ появится здесь.</p>
                  <Button onClick={() => go("catalog")}>Выбрать услуги</Button>
                </div>
              )}
        </div>
      )}
      {view === "order" &&
        (order ? (
          <OrderDetails order={order} catalog={catalog} />
        ) : (
          !loading && (
            <Alert tone="warning">
              Заказ не найден. Перейдите в «Мои заказы».
            </Alert>
          )
        ))}
      {view === "service" && !service && (
        <Button onClick={() => go("catalog")}>Вернуться к услугам</Button>
      )}
      {cart.items.length > 0 && (view === "catalog" || view === "service") && (
        <div className="extras-cart-bar">
          <Button disabled={busy} onClick={() => go("cart")}>
            <ShoppingBag size={19} aria-hidden="true" /> Корзина ·{" "}
            {cart.items.length}{" "}
            {cart.items.length === 1
              ? "позиция"
              : cart.items.length < 5
                ? "позиции"
                : "позиций"}{" "}
            · {money(total)}
          </Button>
        </div>
      )}
    </div>
  );
}
