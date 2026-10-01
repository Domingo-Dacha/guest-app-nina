import type { StayContext } from "@/data/contracts/extras";

export function farmBasketMessage(stay: Pick<StayContext, "houseName">) {
  return `Я гость Domingo Dacha — дом ${stay.houseName}\nХочу заказать фермерскую корзину`;
}

// Telegram public username links prefill a draft; the guest sends it themselves.
// https://core.telegram.org/api/links#public-username-links
export function farmBasketLink(
  username: string,
  stay: Pick<StayContext, "houseName">,
) {
  return `https://t.me/${encodeURIComponent(username)}?${new URLSearchParams({ text: farmBasketMessage(stay) })}`;
}
