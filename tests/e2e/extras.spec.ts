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
          pricedItem(i, state.catalog),
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
    .getByRole("button", { name: "Выбрать: Завтрак на двоих", exact: true })
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
    page.getByRole("button", { name: "Выбрать: Фурако", exact: true }),
  ).toBeVisible();
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
      name: "Выбрать: Завтрак на двоих",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Выбрать: Фурако", exact: true })
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
    .getByRole("button", { name: "Выбрать: Фурако", exact: true })
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
    has: page.getByRole("heading", { name: "Завтрак на двоих", exact: true }),
  });
  await breakfastCard
    .getByRole("button", { name: "Изменить", exact: true })
    .click();
  await expect(page.getByLabel("Интервал доставки")).toHaveValue("09:00–09:30");
  await page.getByLabel("Количество наборов").selectOption("2");
  await page.getByRole("button", { name: /Сохранить изменения/ }).click();
  await expect(breakfastCard).toContainText(/2 наб/);
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
  expect(harness.state.orders[0].total).toBe(1090000);
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
}) => {
  const { state } = await setup(page, context);
  await page.goto("/extras");
  await page.getByRole("button", { name: "Еда", exact: true }).click();
  for (const name of ["Фермерская корзина", "Завтрак на двоих", "Обед", "Ужин"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Выбрать: Обед", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Стоимость уточняется" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Добавить в корзину/ }),
  ).toHaveCount(0);
  await page.goto("/extras?view=service&service=bath-paradise");
  await expect(
    page.getByText("Эта услуга доступна только для гостей «Меридиана»."),
  ).toBeVisible();
  await page.goto("/extras?category=bath");
  await expect(
    page.getByRole("heading", { name: "Баня «Венский»" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Баня «Гавшино»" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Райская баня" })).toHaveCount(
    0,
  );
  await expect
    .poll(() =>
      page
        .getByAltText("Интерьер парной с панорамным окном — общее фото бань")
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  state.stay.houseName = "Меридиан";
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Райская баня" }),
  ).toBeVisible();
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
test("bicycles can be ordered free without going to payment", async ({
  page,
  context,
}, testInfo) => {
  const { state } = await setup(page, context);
  await page.goto("/extras?category=experiences");
  await page
    .getByRole("button", { name: "Выбрать: Велосипеды", exact: true })
    .click();
  await page.getByLabel("Дата", { exact: true }).selectOption("2026-10-17");
  await page.getByLabel("Количество велосипедов").selectOption("2");
  await page.getByRole("button", { name: /Добавить в корзину/ }).click();
  await openCheckout(page);
  await page
    .getByRole("button", { name: "Оформить бесплатно", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Спасибо, заказ сохранён" }),
  ).toBeVisible();
  await expect(
    page.getByText("Без оплаты · Ожидает согласования", { exact: true }),
  ).toBeVisible();
  expect(state.orders[0]).toMatchObject({
    total: 0,
    paymentStatus: "not_required",
  });
  await page.screenshot({
    path: testInfo.outputPath("free-bicycles.png"),
    fullPage: true,
  });
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
