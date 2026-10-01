import { randomUUID } from "node:crypto";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { extrasFixture } from "../../src/data/fixtures/extras";
import type {
  ExtraOrder,
  ExtrasCommand,
  ExtrasSnapshot,
} from "../../src/data/contracts/extras";
import { createSessionToken, SESSION_COOKIE } from "../../src/lib/auth/token";
import {
  cartTotal,
  pricedItem,
  repriceItem,
  serviceFor,
  validateCheckout,
  validateSelection,
} from "../../src/lib/extras-rules";

// Browser tests use a deterministic API double. The actual SQL, constraints,
// rollback and concurrent checkout are exercised in extras-database.test.ts.
async function setup(page: Page, context: BrowserContext) {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: createSessionToken("local", "playwright-only-session-secret"),
      url: "http://localhost:3000",
    },
  ]);
  const state: ExtrasSnapshot = {
    catalog: structuredClone(extrasFixture),
    stay: {
      id: "demo-booking-001",
      guestName: "Тестовый гость",
      houseName: "Дом у сосен",
      contact: "guest@example.test",
      checkIn: "2026-10-16",
      checkOut: "2026-10-18",
      checkInTime: "15:00",
      checkOutTime: "12:00",
      guests: 4,
    },
    cart: { version: 0, items: [] },
    orders: [],
    serverNow: "2026-10-16T10:00:00Z",
    writable: true,
  };
  let checkoutCalls = 0;
  await page.route("**/api/extras", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: state });
    const command = route.request().postDataJSON() as ExtrasCommand;
    try {
      if (command.version !== state.cart.version)
        throw new Error("Корзина изменилась");
      if (command.action === "save") {
        const reason = validateSelection(
          command.item,
          state.stay,
          state.catalog,
          new Date(state.serverNow),
        );
        if (reason) throw new Error(reason);
        state.cart.items = [
          ...state.cart.items.filter((i) => i.id !== command.item.id),
          pricedItem(command.item, state.catalog),
        ];
        state.cart.version++;
      } else if (command.action === "remove") {
        state.cart.items = state.cart.items.filter((i) => i.id !== command.id);
        state.cart.version++;
      } else if (command.action === "reprice") {
        state.cart.items = state.cart.items.map((i) =>
          repriceItem(i, state.catalog),
        );
        state.cart.version++;
      } else {
        validateCheckout(
          state.cart.items,
          state.stay,
          state.catalog,
          command.total,
          new Date(state.serverNow),
        );
        if (command.action === "checkout") {
          checkoutCalls++;
          const order: ExtraOrder = {
            id: randomUUID(),
            number: "DG-TEST0001",
            createdAt: state.serverNow,
            paymentStatus: command.total === 0 ? "not_required" : "paid",
            total: cartTotal(state.cart.items),
            comment: command.comment,
            stay: structuredClone(state.stay),
            items: state.cart.items.map((i) => ({
              ...i,
              name: serviceFor(state.catalog, i.serviceId).name,
              addonName: i.decoration ? "Украшение в бочку" : null,
              fulfillmentStatus:
                i.serviceId === "breakfast" ? "confirmed" : "awaiting_approval",
              confirmedTime: i.serviceId === "breakfast" ? i.time : null,
            })),
          };
          state.orders.unshift(order);
          state.cart = { version: state.cart.version + 1, items: [] };
          return route.fulfill({ json: { order } });
        }
      }
      return route.fulfill({ json: { order: null } });
    } catch (error) {
      return route.fulfill({
        status: 409,
        json: { error: (error as Error).message },
      });
    }
  });
  return { state, checkoutCalls: () => checkoutCalls };
}
async function breakfast(page: Page) {
  await page
    .getByRole("button", { name: "Выбрать: Завтрак", exact: true })
    .click();
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Интервал доставки").selectOption("09:00–09:30");
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await expect(
    page.getByRole("heading", { name: "Допуслуги", exact: true }),
  ).toBeVisible();
}
async function openCheckout(page: Page) {
  await page.getByRole("button", { name: /^Корзина ·/ }).click();
  await page.getByRole("button", { name: "К оформлению", exact: true }).click();
}
test("full extras journey keeps drafts, edits the cart, handles failed/cancelled payment and restores an order", async ({
  page,
  context,
}, testInfo) => {
  // The complete journey includes cart edits, three payment outcomes and screenshots.
  test.setTimeout(60_000);
  const harness = await setup(page, context);
  await page.goto("/");
  await page.getByRole("link", { name: "Допуслуги", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Выбрать: Бочка фурако", exact: true }),
  ).toBeVisible();
  await page
    .getByAltText("Фурако на деревянной террасе среди деревьев")
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .getByAltText("Фурако на деревянной террасе среди деревьев")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("catalog.png"),
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Баня и фурако", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Выбрать: Завтрак",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Выбрать: Бочка фурако", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toBeDisabled();
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Желаемое время готовности").selectOption("19:00");
  await expect(
    page.getByRole("checkbox", { name: /Украшение в бочку/ }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Украшение в бочку/ }).check();
  await page.screenshot({
    path: testInfo.outputPath("service.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Баня и фурако", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Выбрать: Бочка фурако", exact: true })
    .click();
  await expect(page.getByLabel("Желаемое время готовности")).toHaveValue(
    "19:00",
  );
  await expect(
    page.getByRole("checkbox", { name: /Украшение в бочку/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await breakfast(page);
  await page.getByRole("button", { name: /^Корзина ·/ }).click();
  const breakfastCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Завтрак", exact: true }),
  });
  await breakfastCard
    .getByRole("button", { name: "Изменить", exact: true })
    .click();
  await expect(page.getByLabel("Интервал доставки")).toHaveValue("09:00–09:30");
  await page.getByLabel("Количество человек").selectOption("2");
  await page.getByRole("button", { name: /Сохранить изменения/ }).click();
  await expect(breakfastCard).toContainText(/2 чел/);
  await breakfastCard
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(breakfastCard).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await breakfast(page);
  await openCheckout(page);
  await page.getByLabel("Комментарий — необязательно").fill("Тест оформления");
  await page.screenshot({
    path: testInfo.outputPath("checkout.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page.getByRole("button", { name: "Проверить ошибку оплаты" }).click();
  await expect(
    page.getByText(/Корзина сохранена, списаний не было/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться к оформлению" }).click();
  await expect(page.getByLabel("Комментарий — необязательно")).toHaveValue(
    "Тест оформления",
  );
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page
    .getByRole("button", { name: "Отменить оплату", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Оплата отменена" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться к оформлению" }).click();
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page
    .getByRole("button", { name: "Успешная демооплата", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  await expect(
    page.getByText("Оплачено · Ожидает согласования", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Оплачено · Подтверждено", { exact: true }),
  ).toBeVisible();
  expect(harness.checkoutCalls()).toBe(1);
  expect(harness.state.orders[0].total).toBe(990000);
  expect(harness.state.cart.items).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath("result.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "DG-TEST0001", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Посмотреть заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Заказ DG-TEST0001" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Оплачено · Ожидает согласования", { exact: true }),
  ).toBeVisible();
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
});
test("expanded catalog shows unknown prices, photos and Meridian-only sauna", async ({
  page,
  context,
}, testInfo) => {
  const { state } = await setup(page, context);
  await page.goto("/extras");
  await page.getByRole("button", { name: "Еда", exact: true }).click();
  for (const name of ["Фермерская корзина", "Завтрак", "Обед", "Ужин"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Выбрать:/ })).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "Бургер", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Выбрать: Ужин", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Стоимость уточняется" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toHaveCount(0);
  const dinnerPhoto = page.getByAltText(
    "Ужин: бургер с фирменной булочкой Domingo Dacha",
  );
  await dinnerPhoto.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      dinnerPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("dinner.png"),
    fullPage: true,
  });
  await page.goto("/extras?view=service&service=bath-paradise");
  await expect(
    page.getByText("Эта услуга доступна только для гостей «Меридиана»."),
  ).toBeVisible();
  await page.goto("/extras?category=bath");
  await expect(
    page.getByRole("heading", { name: "Баня «Венский»", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Баня «Гавшино»" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Райская баня" })).toHaveCount(
    0,
  );
  const venskyPhoto = page.getByAltText("Интерьер: Баня «Венский»").first();
  await venskyPhoto.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      venskyPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  state.stay.houseName = "Меридиан";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Райская баня" }),
  ).toBeVisible();
});
test("bath package preserves dates, hours and robes, and firewood keeps quantities", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const { state } = await setup(page, context);
  await page.goto("/extras?view=service&service=bath-vensky");
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await page.getByLabel("Длительность бани").selectOption("3");
  await page.getByLabel(/Халаты/).selectOption("2");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/11\s*500/);
  await page.getByRole("button", { name: /Добавить фурако на 4 часа/ }).click();
  await expect(
    page.getByRole("heading", { name: "Баня «Венский» + фурако", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(
    "2026-10-17",
  );
  await expect(page.getByLabel("Желаемое время начала")).toHaveValue("16:00");
  await expect(page.getByLabel("Длительность бани")).toHaveValue("3");
  await expect(page.getByLabel(/Халаты/)).toHaveValue("2");
  await page.getByRole("checkbox", { name: /Украшение в бочку/ }).check();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/18\s*500/);
  await page.screenshot({
    path: testInfo.outputPath("bath-package.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await page
    .getByRole("button", { name: "Выбрать: Дрова", exact: true })
    .click();
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Количество упаковок по 5 кг").selectOption("2");
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await openCheckout(page);
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page.getByRole("button", { name: "Успешная демооплата" }).click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  expect(state.orders[0].total).toBe(2050000);
  await page.reload();
  await expect(
    page
      .locator(".extras-item-summary")
      .filter({ hasText: "Баня «Венский» + фурако" }),
  ).toContainText("Баня: 3 ч");
  await page.goto("/extras?view=service&service=bath-gavshino");
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await page.getByLabel(/Халаты/).selectOption("2");
  await page.getByLabel("Длительность бани").selectOption("4");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/11\s*000/);
  state.stay.houseName = "Меридиан";
  await page.goto("/extras?view=service&service=bath-paradise");
  await expect(page.getByLabel("Дата", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Халаты/)).toBeVisible();
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await page.getByLabel("Длительность бани").selectOption("4");
  await page.getByLabel(/Халаты/).selectOption("2");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/13\s*500/);
});
test("New Year tariffs follow the selected date and separate sauna furako costs 6000", async ({
  page,
  context,
}, testInfo) => {
  const { state } = await setup(page, context);
  state.stay.checkIn = "2026-12-30";
  state.stay.checkOut = "2027-01-12";
  state.serverNow = "2026-12-29T10:00:00Z";
  await page.goto("/extras?view=service&service=bath-vensky");
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-12-30");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/8\s*000/);
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-12-31");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/10\s*000/);
  await expect(page.getByText(/Применён новогодний тариф/)).toBeVisible();
  await page.getByRole("button", { name: /Добавить фурако на 4 часа/ }).click();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/15\s*000/);
  await page.getByLabel("Дата", { exact: true }).selectOption("2027-01-10");
  await expect(page.locator(".extras-base-price")).toContainText(/15\s*000/);
  await page.getByLabel("Дата", { exact: true }).selectOption("2027-01-11");
  await expect(page.locator(".extras-base-price")).toContainText(/13\s*000/);
  await page.goto("/extras?view=service&service=furako-vensky");
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-12-31");
  await page.getByLabel("Желаемое время начала").selectOption("16:00");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/6\s*000/);
  await page.screenshot({
    path: testInfo.outputPath("separate-furako.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  expect(state.cart.items[0]).toMatchObject({
    serviceId: "furako-vensky",
    unitPrice: 600000,
  });
});
test("furako duration and optional extras survive cart editing and order reload", async ({
  page,
  context,
}, testInfo) => {
  const { state } = await setup(page, context);
  await page.goto("/extras?view=service&service=furako");
  await expect(
    page.getByRole("checkbox", { name: /Сибирская пихта/ }),
  ).not.toBeChecked();
  await expect(page.getByLabel(/Халаты/)).toHaveValue("0");
  await page.getByLabel("Длительность", { exact: true }).selectOption("2");
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-16");
  await page.getByLabel("Желаемое время готовности").selectOption("19:00");
  await page.getByRole("checkbox", { name: /Украшение в бочку/ }).check();
  await page.getByRole("checkbox", { name: /Сибирская пихта/ }).check();
  await page.getByLabel(/Халаты/).selectOption("2");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/13\s*000/);
  await expect(page.locator(".extras-base-price")).toContainText("за 2 дня");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.screenshot({
    path: testInfo.outputPath("furako-options.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await page.getByRole("button", { name: /^Корзина ·/ }).click();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(page.getByLabel("Длительность", { exact: true })).toHaveValue(
    "2",
  );
  await expect(
    page.getByRole("checkbox", { name: /Сибирская пихта/ }),
  ).toBeChecked();
  await expect(page.getByLabel(/Халаты/)).toHaveValue("2");
  await page.getByRole("button", { name: /Сохранить изменения/ }).click();
  await page.getByRole("button", { name: "К оформлению", exact: true }).click();
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page.getByRole("button", { name: "Успешная демооплата" }).click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  expect(state.orders[0].total).toBe(1300000);
  await page.reload();
  await expect(page.locator(".extras-item-summary")).toContainText(
    "Сибирская пихта",
  );
  await expect(page.locator(".extras-item-summary")).toContainText("Халат: 2");
  await expect(page.locator(".extras-item-summary")).toContainText("2 дня");
});
test("basket opens a Telegram draft with the stay house and bicycles are retired", async ({
  page,
  context,
}, testInfo) => {
  const { state } = await setup(page, context);
  state.stay.houseName = "Меридиан & Лес";
  await page.goto("/extras");
  await expect(
    page.getByRole("heading", { name: "Велосипеды", exact: true }),
  ).toHaveCount(0);
  await page.goto("/extras?view=service&service=bicycles");
  await expect(
    page.getByRole("heading", { name: "Услуга недоступна", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toHaveCount(0);
  await page.goto("/extras?category=food");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Фермерская корзина",
      exact: true,
    }),
  });
  await expect(card).not.toContainText("Время по согласованию");
  await expect(card).not.toContainText("Стоимость уточняется");
  await page
    .getByRole("button", { name: "Выбрать: Фермерская корзина", exact: true })
    .click();
  for (const item of [
    "Молоко — 1 л",
    "Яйца — 10 шт.",
    "Адыгейский козий сыр",
    "Хлеб ржаной домашний",
    "Подарок-сюрприз",
  ])
    await expect(page.getByText(item, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Дата", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toHaveCount(0);
  const orderLink = page.getByRole("link", { name: "Заказать", exact: true });
  const url = new URL((await orderLink.getAttribute("href"))!);
  expect(url.origin).toBe("https://t.me");
  expect(url.pathname).toBe("/Margosch_ka");
  expect(url.searchParams.get("text")).toBe(
    "Я гость Domingo Dacha — дом Меридиан & Лес\nХочу заказать фермерскую корзину",
  );
  expect(state.orders).toHaveLength(0);
  expect(state.cart.items).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath("farm-basket.png"),
    fullPage: true,
  });
  // Intercept before clicking: verify navigation without contacting the real account.
  await context.route("https://t.me/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Telegram draft preview</p>",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await orderLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get("text")).toBe(
    url.searchParams.get("text"),
  );
  await popup.close();
});
test("checkout rechecks a breakfast deadline that elapsed while the cart was open", async ({
  page,
  context,
}) => {
  const { state } = await setup(page, context);
  await page.goto("/extras");
  await breakfast(page);
  await openCheckout(page);
  state.serverNow = "2026-10-16T15:00:00Z";
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Приём заказов");
  expect(state.cart.items).toHaveLength(1);
  expect(state.orders).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Перейти к демооплате" }),
  ).toBeDisabled();
});
test("a price change must be accepted before payment", async ({
  page,
  context,
}) => {
  const { state } = await setup(page, context);
  await page.goto("/extras");
  await breakfast(page);
  await openCheckout(page);
  state.catalog.services.find((s) => s.id === "breakfast")!.price = 210000;
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Цены изменились",
  );
  await expect(
    page.getByRole("button", { name: "Перейти к демооплате" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Принять новую сумму" }).click();
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page
    .getByRole("button", { name: "Успешная демооплата", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  expect(state.orders[0].total).toBe(210000);
});

test("guest copy, service order and empty-category links stay consistent", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const { state } = await setup(page, context);
  const copy = [
    [
      "breakfast",
      "Завтрак",
      "Начните утро вкусно и без спешки. Завтрак с доставкой прямо на вашу дачу.",
    ],
    [
      "lunch",
      "Обед",
      "Вкусный обед без готовки и лишних хлопот. Мы приготовим его и доставим к вашему домику.",
    ],
    [
      "dinner",
      "Ужин",
      "Завершите день вкусным ужином, не отвлекаясь от отдыха.",
    ],
    [
      "farm-basket",
      "Фермерская корзина",
      "Возьмите фермерские натуральные продукты на пикник или заберите домой, чтобы приготовить что-нибудь вкусное.",
    ],
    [
      "sup",
      "Сапы",
      "В теплое время года мы организуем сплавы на сапах по реке Нара.",
    ],
    [
      "late-checkout",
      "Поздний выезд",
      "Продлите отдых и останьтесь в любимом домике до вечера, если он свободен после вашего проживания.",
    ],
  ];
  await page.goto("/extras");
  await expect(page.locator(".extras-service-card h2")).toHaveText([
    "Завтрак",
    "Обед",
    "Ужин",
    "Фермерская корзина",
    "Бочка фурако",
    "Сапы",
    "Поздний выезд",
    "Фурако у бани «Венский»",
    "Баня «Венский»",
    "Баня «Гавшино»",
    "Баня «Венский» + фурако",
    "Дрова",
  ]);
  for (const [, name, description] of copy) {
    const card = page
      .locator(".extras-service-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(
      card.locator(".extras-service-card__body > p").nth(1),
    ).toHaveText(description);
  }
  await expect(
    page.getByRole("button", { name: "Особый повод", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("updated-catalog.png"),
    fullPage: false,
  });
  for (const [id, name, description] of copy) {
    await page
      .getByRole("button", { name: `Выбрать: ${name}`, exact: true })
      .click();
    await expect(page.locator(".extras-detail-copy > p")).toHaveText(
      description,
    );
    const widths = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    if (id === "breakfast")
      await page.screenshot({
        path: testInfo.outputPath("updated-breakfast.png"),
        fullPage: true,
      });
    await page.getByRole("button", { name: "Назад", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Выбрать: Бочка фурако", exact: true })
    .click();
  await expect(page.locator(".extras-detail-copy")).toContainText(
    "Попробуйте новый вид парения.",
  );
  await expect(page.locator(".extras-detail")).toContainText(
    "Вы выбираете желаемое время.",
  );
  await expect(page.locator(".extras-detail")).not.toContainText(
    "а не свободный слот",
  );
  await expect(page.locator(".extras-detail-copy")).toContainText(
    "Время требует согласования.",
  );
  await page.goto("/extras?view=service&service=bicycles");
  await expect(page.locator(".extras-detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Вернуться к услугам" }).click();
  await expect(
    page.getByRole("heading", { name: "Допуслуги", exact: true }),
  ).toBeVisible();
  state.catalog.services.find((s) => s.id === "sup")!.retired = true;
  await page.goto("/extras?category=experiences");
  await expect(
    page.getByRole("button", { name: "Впечатления", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Все", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".extras-service-card").first()).toContainText(
    "Завтрак",
  );
  await page.goto("/");
  await expect(
    page.getByText(copy.find(([id]) => id === "sup")![2], { exact: true }),
  ).toBeVisible();
});

test("breakfast costs 900 per person through checkout and order history", async ({
  page,
  context,
}) => {
  const { state } = await setup(page, context);
  await page.goto("/extras?view=service&service=breakfast");
  await expect(page.locator(".extras-base-price")).toContainText(/900/);
  await expect(page.locator(".extras-base-price")).toContainText(
    "за 1 человека",
  );
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Интервал доставки").selectOption("09:00–09:30");
  await page.getByLabel("Количество человек").selectOption("3");
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toContainText(/2\s*700/);
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await openCheckout(page);
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page
    .getByRole("button", { name: "Успешная демооплата", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  expect(state.orders[0].total).toBe(270000);
  expect(state.orders[0].items[0]).toMatchObject({
    quantity: 3,
    servingsPerUnit: 1,
    unitPrice: 90000,
  });
  await page.reload();
  await expect(page.locator(".extras-item-summary")).toContainText(
    /3 чел. × 900/,
  );
});

test("legacy breakfast cart requires confirmation and keeps four portions when switching to per-person pricing", async ({
  page,
  context,
}) => {
  const { state } = await setup(page, context);
  state.cart = {
    version: 1,
    items: [
      {
        ...pricedItem(
          {
            id: randomUUID(),
            serviceId: "breakfast",
            date: "2026-10-17",
            time: "09:00–09:30",
            quantity: 2,
            decoration: false,
          },
          state.catalog,
        ),
        unitPrice: 190000,
        servingsPerUnit: 2,
      },
    ],
  };
  await page.goto("/extras?view=checkout");
  await expect(page.locator(".extras-item-summary")).toContainText(
    /2 наб. на двоих/,
  );
  await expect(
    page.getByRole("button", { name: "Перейти к демооплате" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/количество порций в старой корзине сохраняется/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Принять новую сумму" }).click();
  await expect(page.locator(".extras-item-summary")).toContainText(
    /4 чел. × 900/,
  );
  expect(state.cart.items[0]).toMatchObject({
    quantity: 4,
    servingsPerUnit: 1,
    unitPrice: 90000,
  });
  await page.getByRole("button", { name: "Перейти к демооплате" }).click();
  await page
    .getByRole("button", { name: "Успешная демооплата", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  expect(state.orders[0].total).toBe(360000);
});
