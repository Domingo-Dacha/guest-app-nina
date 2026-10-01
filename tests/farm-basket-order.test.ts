import { expect, it } from "vitest";
import { farmBasketLink, farmBasketMessage } from "@/lib/farm-basket-order";

it("prefills only the current house and basket request in Margosch_ka's chat", () => {
  const stay = {
    houseName: "Дом «Нара & Лес» + №2",
    guestName: "Не передаётся",
    contact: "private@example.test",
  };
  const link = new URL(farmBasketLink("Margosch_ka", stay));
  expect(link.origin).toBe("https://t.me");
  expect(link.pathname).toBe("/Margosch_ka");
  expect(link.searchParams.get("text")).toBe(
    "Я гость Domingo Dacha — дом Дом «Нара & Лес» + №2\nХочу заказать фермерскую корзину",
  );
  expect([...link.searchParams.keys()]).toEqual(["text"]);
  expect(farmBasketMessage(stay)).not.toContain(stay.contact);
  expect(farmBasketMessage(stay)).not.toContain(stay.guestName);
});
