"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  RefreshCw,
  Utensils,
  Waves,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type {
  Department,
  StaffCommand,
  StaffSnapshot,
  StaffTask,
  TransferRecord,
} from "@/data/contracts/staff";
import {
  actionLabel,
  addDays,
  departmentNames,
  moscowDate,
  nextWorkStatus,
  taskStatusLabel,
} from "@/lib/staff-rules";
import { money, shortDate } from "@/lib/extras-rules";

const filters = [
  ["all", "Все задания"],
  ["new", "Новые"],
  ["working", "В работе"],
  ["completed", "Выполненные"],
  ["awaiting_approval", "Согласование"],
  ["payment_hold", "Проверить оплату"],
] as const;
const transferNames = {
  pending: "Ожидает переноса",
  transferred: "Перенесён вручную",
  needs_review: "Требует проверки",
  error: "Ошибка переноса",
};
function paymentLabel(status: StaffTask["paymentStatus"]) {
  return {
    paid: "Демо-оплата",
    not_required: "Без оплаты",
    refund_pending: "Возврат ожидается",
    refunded: "Возвращён",
  }[status];
}
function TaskCard({
  task,
  manager,
  writable,
  busy,
  onCommand,
}: {
  task: StaffTask;
  manager: boolean;
  writable: boolean;
  busy: boolean;
  onCommand: (c: StaffCommand) => Promise<boolean>;
}) {
  const [time, setTime] = useState(
    /^\d\d:\d\d/.test(task.requestedTime) ? task.requestedTime : "",
  );
  const next = nextWorkStatus(task.status, task.department);
  return (
    <article className="staff-task" data-task-id={task.id}>
      <div className="staff-task-time">
        <Clock3 size={18} aria-hidden="true" />
        <strong>{shortDate(task.date)}</strong>
        <span>{task.confirmedTime ?? task.requestedTime}</span>
      </div>
      <div className="staff-task-body">
        <div className="staff-task-heading">
          <div>
            <p className="eyebrow">Дом «{task.houseName}»</p>
            <h3>{task.name}</h3>
          </div>
          <span className={`staff-status staff-status--${task.status}`}>
            {taskStatusLabel(task)}
          </span>
        </div>
        <p className="staff-meta">
          Заказ {task.orderNumber} · гостей в доме: {task.guests}
        </p>
        <p className="staff-quantity">
          {task.serviceId === "breakfast"
            ? `Наборов на двоих: ${task.quantity} · ${task.quantity * 2} порций`
            : `Количество: ${task.quantity}`}
          {task.durationHours ? ` · Баня: ${task.durationHours} ч` : ""}
          {task.serviceId === "bath-vensky-furako" ? " · Фурако: 4 ч" : ""}
          {task.serviceId === "firewood" ? ` · ${task.quantity * 5} кг` : ""}
          {task.serviceId === "furako" ? ` · ${task.durationDays} дн.` : ""}
        </p>
        {(task.robes > 0 || task.decoration || task.fir) && (
          <p className="staff-meta">
            {[
              task.robes ? `Халаты: ${task.robes}` : "",
              task.decoration ? "Украшение бочки" : "",
              task.fir ? "Сибирская пихта" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {task.comment && (
          <p className="staff-comment">
            <strong>Комментарий к заказу:</strong> {task.comment}
          </p>
        )}
        <div className="staff-task-footer">
          <span>
            Стоимость: <strong>{money(task.amount)}</strong>
          </span>
          <span>
            {paymentLabel(task.paymentStatus)}:{" "}
            <strong>
              {task.paidAmount === null
                ? "требует проверки"
                : money(task.paidAmount)}
            </strong>
          </span>
        </div>
        {task.status === "awaiting_approval" &&
          (manager ? (
            <form
              className="staff-confirm"
              onSubmit={async (e) => {
                e.preventDefault();
                await onCommand({
                  action: "confirm",
                  orderId: task.orderId,
                  id: task.id,
                  version: task.version,
                  time,
                });
              }}
            >
              <label htmlFor={`time-${task.id}`}>
                Согласованное время
                <input
                  id={`time-${task.id}`}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="16:00 или 09:00–09:30"
                  required
                  pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9](?:–(?:[01][0-9]|2[0-3]):[0-5][0-9])?"
                  disabled={busy || !writable}
                />
              </label>
              <Button disabled={busy || !writable}>Подтвердить условия</Button>
            </form>
          ) : (
            <p className="staff-meta">
              Управляющий согласует время перед началом работы.
            </p>
          ))}
        {next && (
          <Button
            disabled={busy || !writable}
            onClick={() =>
              void onCommand({
                action: "advance",
                orderId: task.orderId,
                id: task.id,
                version: task.version,
              })
            }
          >
            {actionLabel(task)}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
        {task.history.length > 0 && (
          <details className="staff-history">
            <summary>История действий · {task.history.length}</summary>
            <ol>
              {task.history.map((event) => (
                <li key={event.id}>
                  <strong>{event.detail}</strong>
                  <span>
                    {event.actor} ·{" "}
                    {new Date(event.createdAt).toLocaleString("ru-RU", {
                      timeZone: "Europe/Moscow",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </article>
  );
}
function TransferCard({
  record,
  tasks,
  busy,
  writable,
  onCommand,
}: {
  record: TransferRecord;
  tasks: StaffTask[];
  busy: boolean;
  writable: boolean;
  onCommand: (c: StaffCommand) => Promise<boolean>;
}) {
  const [status, setStatus] = useState(record.status),
    [booking, setBooking] = useState(record.bookingReference),
    [reference, setReference] = useState(record.recordReference),
    [note, setNote] = useState(record.note);
  return (
    <article className="staff-transfer">
      <header>
        <div>
          <p className="eyebrow">Дом «{record.houseName}»</p>
          <h3>{record.orderNumber}</h3>
        </div>
        <span className="staff-status">{transferNames[record.status]}</span>
      </header>
      <p>
        Весь заказ: <strong>{money(record.total)}</strong> ·{" "}
        {paymentLabel(record.paymentStatus)}
      </p>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            {t.name} · {shortDate(t.date)} · {t.quantity} шт. ·{" "}
            {money(t.amount)}
          </li>
        ))}
      </ul>
      <p className="staff-meta">
        Показаны позиции выбранного периода. Общая сумма относится ко всему
        заказу.
      </p>
      <details>
        <summary>Отметить ручной перенос</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onCommand({
              action: "transfer",
              orderId: record.orderId,
              version: record.version,
              status,
              bookingReference: booking,
              recordReference: reference,
              note,
            });
          }}
        >
          <label>
            Статус переноса
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TransferRecord["status"])
              }
              disabled={busy || !writable}
            >
              {Object.entries(transferNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Номер бронирования Bnovo
            <input
              value={booking}
              onChange={(e) => setBooking(e.target.value)}
              maxLength={120}
              required={status === "transferred"}
              disabled={busy || !writable}
            />
          </label>
          <label>
            Номер записи или ссылка Bnovo
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={160}
              required={status === "transferred"}
              disabled={busy || !writable}
            />
          </label>
          <label>
            Комментарий к переносу
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              disabled={busy || !writable}
            />
          </label>
          <Button disabled={busy || !writable}>Сохранить отметку</Button>
        </form>
      </details>
      {record.updatedAt && (
        <p className="staff-meta">
          {record.updatedBy} ·{" "}
          {new Date(record.updatedAt).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          })}
        </p>
      )}
    </article>
  );
}
export function StaffDashboard({ initialDate }: { initialDate: string }) {
  const [data, setData] = useState<StaffSnapshot | null>(null),
    [from, setFrom] = useState(initialDate),
    [to, setTo] = useState(initialDate),
    [period, setPeriod] = useState(false);
  const [filter, setFilter] = useState("all"),
    [department, setDepartment] = useState<Department | "all">("all"),
    [view, setView] = useState<"tasks" | "finance">("tasks");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [updated, setUpdated] = useState<string | null>(null);
  const sequence = useRef(0),
    locked = useRef(false);
  const refresh = useCallback(() => {
    const current = ++sequence.current;
    return fetch(
      `/api/staff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (current !== sequence.current) return;
        if (!response.ok)
          throw new Error(result.error ?? "Не удалось обновить задания.");
        setData(result);
        setUpdated(result.serverNow);
        setError("");
      })
      .catch((e) => {
        if (current === sequence.current)
          setError(
            e instanceof Error ? e.message : "Не удалось обновить задания.",
          );
      })
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, [from, to]);
  useEffect(() => {
    void refresh();
    const update = () => {
      if (!locked.current) void refresh();
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  async function command(input: StaffCommand) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    sequence.current++;
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(result.error ?? "Не удалось сохранить действие.");
      }
      await refresh();
      setNotice(
        input.action === "profile"
          ? "Демонстрационная роль выбрана."
          : "Изменения сохранены.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить действие.",
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const manager = data?.profile?.role === "manager";
  const scope = (data?.tasks ?? []).filter(
    (t) => !manager || department === "all" || t.department === department,
  );
  const visible = scope.filter(
    (t) =>
      filter === "all" ||
      (filter === "working" && ["in_progress", "ready"].includes(t.status)) ||
      t.status === filter,
  );
  const active = scope.filter((t) =>
    ["new", "in_progress", "ready"].includes(t.status),
  );
  const nearest = active.find((t) => t.confirmedTime);
  const kitchen = scope.filter(
    (t) =>
      t.department === "kitchen" &&
      !["cancelled", "payment_hold"].includes(t.status),
  );
  const kitchenTotals = Object.values(
    kitchen.reduce<
      Record<string, { name: string; quantity: number; portions: number }>
    >((acc, t) => {
      const item = acc[t.serviceId] ?? {
        name: t.name,
        quantity: 0,
        portions: 0,
      };
      item.quantity += t.quantity;
      item.portions += t.serviceId === "breakfast" ? t.quantity * 2 : 0;
      acc[t.serviceId] = item;
      return acc;
    }, {}),
  );
  const today = moscowDate(
    new Date(data?.serverNow ?? `${initialDate}T12:00:00Z`),
  );
  return (
    <section className="staff-page">
      <div className="staff-top">
        <div>
          <p className="eyebrow">Domingo · команда</p>
          <h1>Заказы услуг</h1>
          <p className="staff-subtitle">
            Всё, что нужно подготовить к отдыху гостей.
          </p>
        </div>
        <Link className="button button--secondary" href="/extras">
          Гостевое приложение <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="staff-demo">
        <strong>Демонстрационный кабинет</strong>
        <span>
          Общая тестовая база. Роли можно переключать; персональные учётные
          записи сотрудников ещё не подключены. Время — московское.
        </span>
      </div>
      {error && (
        <div role="alert">
          <Alert tone="danger">{error}</Alert>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Повторить загрузку
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="staff-notice">
          <Check size={16} aria-hidden="true" />
          {notice}
        </p>
      )}
      {loading && !data && <p role="status">Загружаем задания…</p>}
      {data && (
        <>
          <div className="staff-controls">
            <label>
              Демонстрационная роль
              <select
                value={data.profile?.role ?? ""}
                disabled={busy}
                onChange={(e) => {
                  setView("tasks");
                  setDepartment("all");
                  setFilter("all");
                  void command({
                    action: "profile",
                    role: e.target
                      .value as StaffSnapshot["profiles"][number]["role"],
                  });
                }}
              >
                <option value="" disabled>
                  Выберите роль
                </option>
                {data.profiles.map((p) => (
                  <option value={p.role} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="staff-sync">
              <span>
                {updated
                  ? `Обновлено в ${new Date(updated).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Ожидаем обновление"}
              </span>
              <Button
                variant="ghost"
                aria-label="Обновить задания"
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw size={18} aria-hidden="true" />
              </Button>
            </div>
          </div>
          {!data.writable && (
            <Alert tone="warning">
              Эта версия доступна только для просмотра.
            </Alert>
          )}
          {!data.profile ? (
            <div className="staff-empty">
              <ClipboardList size={32} aria-hidden="true" />
              <h2>Выберите рабочее направление</h2>
              <p>
                Кухня увидит питание, баня — свои задания, управляющий — весь
                заказ и реестр переноса.
              </p>
            </div>
          ) : (
            <>
              <div className="staff-tabs" aria-label="Период заданий">
                <Button
                  variant={!period && from === today ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => {
                    setFrom(today);
                    setTo(today);
                    setPeriod(false);
                  }}
                >
                  Сегодня
                </Button>
                <Button
                  variant={
                    !period && from === addDays(today, 1)
                      ? "primary"
                      : "secondary"
                  }
                  disabled={busy}
                  onClick={() => {
                    setFrom(addDays(today, 1));
                    setTo(addDays(today, 1));
                    setPeriod(false);
                  }}
                >
                  Завтра
                </Button>
                <Button
                  variant={period ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => {
                    setPeriod(true);
                    setFrom(today);
                    setTo(addDays(today, 30));
                  }}
                >
                  Период
                </Button>
                {manager && (
                  <>
                    <Button
                      variant={view === "tasks" ? "primary" : "secondary"}
                      onClick={() => setView("tasks")}
                    >
                      Задания
                    </Button>
                    <Button
                      variant={view === "finance" ? "primary" : "secondary"}
                      onClick={() => setView("finance")}
                    >
                      Реестр Bnovo
                    </Button>
                  </>
                )}
              </div>
              {period && (
                <div className="staff-range">
                  <label>
                    С даты
                    <input
                      type="date"
                      value={from}
                      max={to}
                      disabled={busy}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    По дату
                    <input
                      type="date"
                      value={to}
                      min={from}
                      max={addDays(from || initialDate, 30)}
                      disabled={busy}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  <span>До 31 дня · по дате оказания услуги</span>
                </div>
              )}
              {view === "tasks" || !manager ? (
                <>
                  {manager && (
                    <div className="staff-tabs" aria-label="Направления">
                      <Button
                        variant={department === "all" ? "primary" : "secondary"}
                        onClick={() => setDepartment("all")}
                      >
                        Все направления
                      </Button>
                      {Object.entries(departmentNames).map(([id, label]) => (
                        <Button
                          key={id}
                          variant={department === id ? "primary" : "secondary"}
                          onClick={() => setDepartment(id as Department)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="staff-metrics">
                    <div>
                      <span>Заданий за период</span>
                      <strong>{scope.length}</strong>
                    </div>
                    <div>
                      <span>В работе и ожидают старта</span>
                      <strong>{active.length}</strong>
                    </div>
                    <div>
                      <span>Требуют согласования</span>
                      <strong>
                        {
                          scope.filter((t) => t.status === "awaiting_approval")
                            .length
                        }
                      </strong>
                    </div>
                    <div>
                      <span>Ближайшее по расписанию</span>
                      <strong className="staff-metric-time">
                        {nearest
                          ? `${shortDate(nearest.date)} · ${nearest.confirmedTime}`
                          : "Нет заданий"}
                      </strong>
                    </div>
                  </div>
                  {kitchenTotals.length > 0 && (
                    <aside className="staff-kitchen">
                      <Utensils size={20} aria-hidden="true" />
                      <div>
                        <h2>Кухня за выбранный период</h2>
                        <p>
                          {kitchenTotals
                            .map(
                              (t) =>
                                `${t.name}: ${t.quantity} ${t.portions ? `наб. / ${t.portions} порц.` : "шт."}`,
                            )
                            .join(" · ")}
                        </p>
                        <small>
                          Включая ожидание согласования. Состав блюд пока не
                          задан в гостевом меню; порции считаются для наборов
                          завтрака на двоих.
                        </small>
                      </div>
                    </aside>
                  )}
                  <div className="staff-filters" aria-label="Статусы заданий">
                    {filters.map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="staff-section-title">
                    <h2>
                      {manager
                        ? department === "all"
                          ? "Все направления"
                          : departmentNames[department]
                        : departmentNames[data.profile.role as Department]}
                    </h2>
                    <span>
                      {visible.length} заданий · по времени готовности
                    </span>
                  </div>
                  {visible.length ? (
                    <div className="staff-task-list">
                      {visible.map((task) => (
                        <TaskCard
                          key={`${task.orderId}-${task.id}-${task.version}`}
                          task={task}
                          manager={manager}
                          writable={data.writable}
                          busy={busy}
                          onCommand={command}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="staff-empty">
                      <Waves size={32} aria-hidden="true" />
                      <h2>На этот период заданий нет</h2>
                      <p>
                        Выберите другой период или статус. Новые оплаченные
                        заказы появятся здесь автоматически.
                      </p>
                      <Link className="button button--secondary" href="/extras">
                        Открыть услуги
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="staff-section-title">
                    <h2>Ручной перенос в Bnovo</h2>
                    <span>
                      {
                        data.transfers.filter((t) => t.status !== "transferred")
                          .length
                      }{" "}
                      ожидают обработки
                    </span>
                  </div>
                  <Alert tone="info">
                    Это реестр отметок. Приложение не подключено к Bnovo и не
                    передаёт туда услуги или платежи. Переносите только тестовые
                    записи в тестовую среду.
                  </Alert>
                  <div className="staff-task-list">
                    {data.transfers.length ? (
                      data.transfers.map((record) => (
                        <TransferCard
                          key={`${record.orderId}-${record.version}`}
                          record={record}
                          tasks={data.tasks.filter(
                            (t) => t.orderId === record.orderId,
                          )}
                          writable={data.writable}
                          busy={busy}
                          onCommand={command}
                        />
                      ))
                    ) : (
                      <div className="staff-empty">
                        <h3>Заказов за выбранный период нет</h3>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
