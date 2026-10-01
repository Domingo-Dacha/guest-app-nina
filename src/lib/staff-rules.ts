import type {
  Department,
  StaffTask,
  TaskStatus,
  WorkStatus,
} from "@/data/contracts/staff";
import type { ServiceId } from "@/data/contracts/extras";

export const departmentNames: Record<Department, string> = {
  kitchen: "Кухня",
  bath: "Баня и фурако",
  other: "Другие услуги",
};
export const statusNames: Record<TaskStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  ready: "Готово",
  completed: "Выполнен",
  awaiting_approval: "Требуется согласование",
  cancelled: "Отменён",
  payment_hold: "Проверить оплату",
};
export function departmentFor(serviceId: ServiceId): Department {
  if (
    ["breakfast", "lunch", "dinner", "burger", "farm-basket"].includes(
      serviceId,
    )
  )
    return "kitchen";
  if (
    [
      "furako",
      "furako-vensky",
      "bath-vensky",
      "bath-vensky-furako",
      "bath-gavshino",
      "bath-paradise",
    ].includes(serviceId)
  )
    return "bath";
  return "other";
}
export function nextWorkStatus(
  status: TaskStatus,
  department: Department,
): WorkStatus | null {
  if (status === "new") return "in_progress";
  if (status === "in_progress")
    return department === "other" ? "completed" : "ready";
  if (status === "ready") return "completed";
  return null;
}
export function actionLabel(
  task: Pick<StaffTask, "status" | "department">,
): string {
  if (task.status === "new") return "Взять в работу";
  if (task.status === "in_progress")
    return task.department === "kitchen"
      ? "Готов к доставке"
      : task.department === "bath"
        ? "Готово к назначенному времени"
        : "Завершить";
  return task.department === "kitchen" ? "Доставлен" : "Завершить";
}
export function taskStatusLabel(
  task: Pick<StaffTask, "status" | "department">,
): string {
  if (task.status === "completed" && task.department === "kitchen")
    return "Доставлен";
  if (task.status === "ready")
    return task.department === "kitchen"
      ? "Готов к доставке"
      : "Готово к назначенному времени";
  return statusNames[task.status];
}
export function moscowDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function compareTasks(a: StaffTask, b: StaffTask): number {
  const time = (task: StaffTask) =>
    task.confirmedTime ??
    (/^\d\d:\d\d/.test(task.requestedTime) ? task.requestedTime : "99:99");
  return (
    a.date.localeCompare(b.date) ||
    time(a).localeCompare(time(b)) ||
    a.orderId.localeCompare(b.orderId) ||
    a.id.localeCompare(b.id)
  );
}
export class StaffError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
