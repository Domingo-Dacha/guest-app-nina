import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type {
  StaffCommand,
  StaffProfile,
  StaffTask,
  TransferRecord,
} from "../../src/data/contracts/staff";
import { staffProfiles } from "../../src/data/fixtures/staff";
import { compareTasks, nextWorkStatus } from "../../src/lib/staff-rules";
import { createSessionToken, SESSION_COOKIE } from "../../src/lib/auth/token";

// Deterministic browser API double; SQL, permissions and concurrent writes are
// independently covered against all real migrations in staff-database.test.ts.
async function setup(context: BrowserContext) {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: createSessionToken("local", "playwright-only-session-secret"),
      url: "http://localhost:3000",
    },
  ]);
  const orderId = randomUUID();
  const base: StaffTask = {
    id: randomUUID(),
    orderId,
    orderNumber: "DG-TEST0001",
    department: "kitchen",
    serviceId: "breakfast",
    name: "Завтрак",
    houseName: "Дом у сосен",
    guests: 4,
    date: "2026-10-17",
    requestedTime: "09:00–09:30",
    confirmedTime: "09:00–09:30",
    quantity: 2,
    robes: 0,
    decoration: false,
    fir: false,
    durationDays: 1,
    durationHours: null,
    amount: 380000,
    paidAmount: 380000,
    paymentStatus: "paid",
    status: "new",
    version: 0,
    comment: "Соус отдельно",
    history: [],
  };
  const state = {
    tasks: [
      {
        ...structuredClone(base),
        id: randomUUID(),
        serviceId: "furako",
        name: "Бочка фурако",
        department: "bath",
        requestedTime: "19:00",
        confirmedTime: null,
        status: "awaiting_approval",
        quantity: 1,
        robes: 2,
        decoration: true,
        amount: 1000000,
        paidAmount: 1000000,
      },
      base,
    ] as StaffTask[],
    transfers: [
      {
        orderId,
        orderNumber: base.orderNumber,
        houseName: base.houseName,
        total: 1380000,
        paymentStatus: "paid",
        status: "pending",
        version: 0,
        bookingReference: "",
        recordReference: "",
        note: "",
        updatedBy: null,
        updatedAt: null,
      },
    ] as TransferRecord[],
    writable: true,
    fail: false,
  };
  // Per-page role represents separate signed browser sessions; task state is
  // shared to exercise device refresh without using localStorage.
  const profiles = new Map<Page, StaffProfile>();
  await context.route("**/api/staff**", async (route) => {
    const page = route.request().frame().page();
    const profile = profiles.get(page) ?? null;
    if (state.fail)
      return route.fulfill({
        status: 503,
        json: { error: "Не удалось загрузить задания. Повторите попытку." },
      });
    if (route.request().method() === "GET") {
      const url = new URL(route.request().url()),
        from = url.searchParams.get("from")!,
        to = url.searchParams.get("to")!;
      const tasks = profile
        ? state.tasks
            .filter(
              (t) =>
                t.date >= from &&
                t.date <= to &&
                (profile.role === "manager" || t.department === profile.role),
            )
            .sort(compareTasks)
        : [];
      return route.fulfill({
        json: {
          profile,
          profiles: staffProfiles,
          tasks,
          transfers:
            profile?.role === "manager"
              ? state.transfers.filter((r) =>
                  tasks.some((t) => t.orderId === r.orderId),
                )
              : [],
          writable: state.writable,
          serverNow: "2026-10-16T10:00:00Z",
        },
      });
    }
    const command = route.request().postDataJSON() as StaffCommand;
    if (command.action === "profile")
      profiles.set(
        page,
        staffProfiles.find((p) => p.role === command.role)!,
      );
    else if (!profile || !state.writable)
      return route.fulfill({ status: 403, json: { error: "Недоступно" } });
    else if (command.action === "transfer") {
      const record = state.transfers.find(
        (r) => r.orderId === command.orderId,
      )!;
      if (record.version !== command.version)
        return route.fulfill({
          status: 409,
          json: { error: "Запись изменилась" },
        });
      Object.assign(record, command, {
        version: record.version + 1,
        updatedBy: profile.name,
        updatedAt: "2026-10-16T10:05:00Z",
      });
    } else {
      const task = state.tasks.find((t) => t.id === command.id)!;
      if (task.version !== command.version)
        return route.fulfill({
          status: 409,
          json: { error: "Задание уже изменено" },
        });
      if (command.action === "confirm") {
        task.confirmedTime = command.time;
        task.status = "new";
      } else task.status = nextWorkStatus(task.status, task.department)!;
      task.version++;
      task.history.push({
        id: randomUUID(),
        actor: profile.name,
        action: command.action,
        detail:
          command.action === "confirm"
            ? `Время согласовано: ${command.time}`
            : "Этап выполнения изменён",
        createdAt: "2026-10-16T10:05:00Z",
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}
async function selectRole(page: Page, role: string) {
  await page.getByLabel("Демонстрационная роль").selectOption(role);
  await expect(page.getByLabel("Демонстрационная роль")).toBeEnabled();
  await page.getByRole("button", { name: "Завтра", exact: true }).click();
}
const card = (page: Page, name: string) =>
  page
    .locator(".staff-task")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(size[0]).toBeLessThanOrEqual(size[1]);
}

test("staff roles split an order, confirm a bath and synchronize kitchen work across devices", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60000);
  const state = await setup(context);
  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "Выберите рабочее направление" }),
  ).toBeVisible();
  await selectRole(page, "manager");
  await expect(page.locator(".staff-task h3")).toHaveText([
    "Завтрак",
    "Бочка фурако",
  ]);
  await expect(page.locator(".staff-kitchen")).toContainText("4 порц.");
  await expect(card(page, "Бочка фурако")).not.toContainText("Взять в работу");
  await card(page, "Бочка фурако")
    .getByLabel("Согласованное время")
    .fill("18:00");
  await card(page, "Бочка фурако")
    .getByRole("button", { name: "Подтвердить условия" })
    .click();
  await expect(
    card(page, "Бочка фурако").locator(".staff-task-time"),
  ).toContainText("18:00");
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("staff-manager.png"),
    fullPage: true,
  });
  const kitchen = await context.newPage();
  await kitchen.goto("/staff");
  await selectRole(kitchen, "kitchen");
  await expect(kitchen.locator(".staff-task h3")).toHaveText(["Завтрак"]);
  await expect(
    kitchen.getByRole("button", { name: "Реестр Bnovo" }),
  ).toHaveCount(0);
  for (const action of ["Взять в работу", "Готов к доставке", "Доставлен"]) {
    await card(kitchen, "Завтрак")
      .getByRole("button", { name: action, exact: true })
      .click();
    await expect(kitchen.getByLabel("Демонстрационная роль")).toBeEnabled();
  }
  await expect(card(kitchen, "Завтрак").locator(".staff-status")).toHaveText(
    "Доставлен",
  );
  await kitchen.reload();
  await kitchen.getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(card(kitchen, "Завтрак").locator(".staff-status")).toHaveText(
    "Доставлен",
  );
  await card(kitchen, "Завтрак")
    .getByText("История действий · 3", { exact: true })
    .click();
  await expect(
    card(kitchen, "Завтрак").locator(".staff-history li"),
  ).toHaveCount(3);
  await noOverflow(kitchen);
  await kitchen.screenshot({
    path: info.outputPath("staff-kitchen.png"),
    fullPage: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(card(page, "Завтрак").locator(".staff-status")).toHaveText(
    "Доставлен",
  );
  await expect(card(page, "Бочка фурако").locator(".staff-status")).toHaveText(
    "Новый",
  );
  expect(state.transfers[0].total).toBe(1380000);
  expect(state.tasks.every((t) => t.paymentStatus === "paid")).toBe(true);
  await page.getByLabel("Демонстрационная роль").selectOption("bath");
  await expect(page.locator(".staff-task h3")).toHaveText(["Бочка фурако"]);
  for (const action of [
    "Взять в работу",
    "Готово к назначенному времени",
    "Завершить",
  ]) {
    await card(page, "Бочка фурако")
      .getByRole("button", { name: action, exact: true })
      .click();
    await expect(page.getByLabel("Демонстрационная роль")).toBeEnabled();
  }
  await expect(card(page, "Бочка фурако").locator(".staff-status")).toHaveText(
    "Выполнен",
  );
});

test("manager transfer registry saves references, dates filter tasks and preview is read only", async ({
  page,
  context,
}, info) => {
  const state = await setup(context);
  await page.goto("/staff");
  await selectRole(page, "manager");
  await page.getByRole("button", { name: "Реестр Bnovo" }).click();
  await expect(
    page.getByText(/Приложение не подключено к Bnovo/),
  ).toBeVisible();
  await page.getByText("Отметить ручной перенос", { exact: true }).click();
  await page.getByLabel("Статус переноса").selectOption("transferred");
  await page.getByLabel("Номер бронирования Bnovo").fill("TEST-BOOKING-1");
  await page.getByLabel("Номер записи или ссылка Bnovo").fill("TEST-ENTRY-1");
  await page
    .getByLabel("Комментарий к переносу")
    .fill("Только тестовая отметка");
  await page.getByRole("button", { name: "Сохранить отметку" }).click();
  await expect(page.locator(".staff-transfer .staff-status")).toHaveText(
    "Перенесён вручную",
  );
  await page.getByText("Отметить ручной перенос", { exact: true }).click();
  await expect(page.getByLabel("Номер записи или ссылка Bnovo")).toHaveValue(
    "TEST-ENTRY-1",
  );
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("staff-finance.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Задания", exact: true }).click();
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "На этот период заданий нет" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Период", exact: true }).click();
  await expect(page.locator(".staff-task")).toHaveCount(2);
  state.writable = false;
  await page.getByRole("button", { name: "Обновить задания" }).click();
  await expect(
    page.getByRole("button", { name: "Взять в работу" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Подтвердить условия" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Эта версия доступна только для просмотра."),
  ).toBeVisible();
  state.fail = true;
  await page.getByRole("button", { name: "Обновить задания" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Не удалось загрузить задания",
  );
  state.fail = false;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(
    page.getByText("Не удалось загрузить задания. Повторите попытку."),
  ).toHaveCount(0);
});
