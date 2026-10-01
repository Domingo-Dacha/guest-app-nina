import { Bath, Coffee, Sunset, Check, Clock3 } from "lucide-react";
import type {
  CartItem,
  ExtraOrder,
  ExtraService,
  ExtrasCatalog,
  OrderItem,
} from "@/data/contracts/extras";
import {
  fulfillmentLabels,
  lineTotal,
  money,
  paymentLabels,
  serviceFor,
  shortDate,
} from "@/lib/extras-rules";

export function ServiceArt({ service }: { service: ExtraService }) {
  const Icon =
    service.id === "furako"
      ? Bath
      : service.id === "breakfast"
        ? Coffee
        : Sunset;
  return (
    <div className={`extras-art extras-art--${service.id}`} aria-hidden="true">
      <div className="extras-art__sun" />
      <Icon strokeWidth={1} />
      <span>DOMINGO · МОМЕНТЫ ОТДЫХА</span>
    </div>
  );
}
export function ItemSummary({
  item,
  catalog,
}: {
  item: CartItem | OrderItem;
  catalog: ExtrasCatalog;
}) {
  const service = serviceFor(catalog, item.serviceId);
  const name = "name" in item ? item.name : service.name;
  const confirmed = "confirmedTime" in item && item.confirmedTime;
  return (
    <div className="extras-item-summary">
      <div className="extras-between">
        <h3>{name}</h3>
        <strong>{money(lineTotal(item))}</strong>
      </div>
      <p>
        {shortDate(item.date)} ·{" "}
        {confirmed
          ? "Подтверждённое время"
          : service.confirmation === "manual"
            ? "Желаемое время"
            : "Доставка"}
        : {confirmed || item.time}
      </p>
      <p>
        {item.serviceId === "breakfast"
          ? `${item.quantity} наб. × ${money(item.unitPrice)}`
          : money(item.unitPrice)}
        {item.decoration && (
          <>
            {" "}
            · {"addonName" in item ? item.addonName : service.addon?.name}: +
            {money(item.addonPrice)}
          </>
        )}
      </p>
    </div>
  );
}
export function OrderDetails({
  order,
  catalog,
}: {
  order: ExtraOrder;
  catalog: ExtrasCatalog;
}) {
  return (
    <>
      <div className="extras-order-meta">
        <span className="status-badge">
          {paymentLabels[order.paymentStatus]}
        </span>
        <span>
          {new Intl.DateTimeFormat("ru-RU", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: catalog.rules.timeZone,
          }).format(new Date(order.createdAt))}
        </span>
      </div>
      <div className="extras-panel">
        <h2>Ваш отдых</h2>
        <p>
          {order.stay.guestName} · {order.stay.houseName}
        </p>
        <p>
          {shortDate(order.stay.checkIn)} — {shortDate(order.stay.checkOut)} ·
          гостей: {order.stay.guests}
        </p>
        <p>Контакт из проживания: {order.stay.contact}</p>
      </div>
      <div className="extras-stack">
        {order.items.map((item) => (
          <article className="extras-panel" key={item.id}>
            <ItemSummary item={item} catalog={catalog} />
            <p
              className={`extras-status ${item.fulfillmentStatus === "awaiting_approval" ? "extras-status--pending" : ""}`}
            >
              {item.fulfillmentStatus === "awaiting_approval" ? (
                <Clock3 size={18} aria-hidden="true" />
              ) : (
                <Check size={18} aria-hidden="true" />
              )}
              {paymentLabels[order.paymentStatus]} ·{" "}
              {fulfillmentLabels[item.fulfillmentStatus]}
            </p>
            {item.fulfillmentStatus === "awaiting_approval" && (
              <p>
                Время требует согласования. После оплаты менеджер свяжется с
                вами. В демонстрационном режиме статус остаётся на согласовании,
                реальные сообщения не отправляются.
              </p>
            )}
          </article>
        ))}
      </div>
      {order.comment && (
        <div className="extras-panel">
          <h2>Комментарий</h2>
          <p className="extras-comment">{order.comment}</p>
        </div>
      )}
      <div className="extras-total">
        <span>Сумма заказа</span>
        <strong>{money(order.total)}</strong>
      </div>
      <p className="extras-note">
        Демонстрационная оплата. Настоящего списания не было.
      </p>
    </>
  );
}
