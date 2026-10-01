import { randomUUID } from "node:crypto";
import type {
  StaffProfile,
  StaffTask,
  StaffMutation,
  StaffRepository,
  TransferRecord,
  WorkStatus,
} from "@/data/contracts/staff";
import type { ExtrasQuery } from "./postgres-extras-repository";
import {
  compareTasks,
  departmentFor,
  nextWorkStatus,
  StaffError,
} from "@/lib/staff-rules";

const departmentSql = `case when i.service_id in ('breakfast','lunch','dinner','burger','farm-basket') then 'kitchen' when i.service_id in ('furako','furako-vensky','bath-vensky','bath-vensky-furako','bath-gavshino','bath-paradise') then 'bath' else 'other' end`;
const number = (id: string) =>
  `DG-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const eligiblePayment = `(o.payment_status='paid' or (o.payment_status='not_required' and o.total=0))`;
type Row = Record<string, unknown>;
function taskFromRow(row: Row): StaffTask {
  const serviceId = row.service_id as StaffTask["serviceId"];
  const amount =
    Number(row.quantity) *
      (Number(row.unit_price) +
        Number(row.addon_price) +
        Number(row.fir_price)) +
    Number(row.robes) * Number(row.robe_price);
  const paid =
    row.payment_status === "paid" ||
    (row.payment_status === "not_required" && Number(row.order_total) === 0);
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    orderNumber: number(String(row.order_id)),
    serviceId,
    name: String(row.name),
    department: departmentFor(serviceId),
    houseName: String(row.house_name),
    guests: Number(row.guests),
    date: String(row.service_date).slice(0, 10),
    requestedTime: String(row.requested_time),
    confirmedTime: row.confirmed_time as string | null,
    quantity: Number(row.quantity),
    servingsPerUnit: Number(
      row.servings_per_unit ?? (serviceId === "breakfast" ? 2 : 1),
    ),
    robes: Number(row.robes),
    decoration: Boolean(row.decoration),
    fir: Boolean(row.fir),
    durationDays: Number(row.duration_days),
    durationHours:
      row.duration_hours == null ? null : Number(row.duration_hours),
    amount,
    paidAmount:
      row.payment_status === "paid"
        ? amount
        : row.payment_status === "not_required"
          ? 0
          : null,
    paymentStatus: row.payment_status as StaffTask["paymentStatus"],
    status:
      row.fulfillment_status === "cancelled"
        ? "cancelled"
        : !paid
          ? "payment_hold"
          : row.fulfillment_status === "completed"
            ? "completed"
            : row.fulfillment_status === "awaiting_approval" ||
                !row.confirmed_time
              ? "awaiting_approval"
              : (row.work_status as WorkStatus),
    version: Number(row.staff_version),
    comment: String(row.comment),
    history: [],
  };
}
export class PostgresStaffRepository implements StaffRepository {
  constructor(
    private query: ExtrasQuery,
    private team: string,
  ) {}
  async snapshot(
    profile: StaffProfile,
    from: string | null,
    to: string | null,
  ) {
    const rows = await this.query(
      `select i.*, i.service_date::text as service_date, o.house_name,o.guests,o.comment,o.total as order_total,o.payment_status from extras_order_items i join extras_orders o on o.team_slug=i.team_slug and o.stay_id=i.stay_id and o.id=i.order_id where i.team_slug=$1 and ($2::date is null or i.service_date >= $2::date) and ($3::date is null or i.service_date <= $3::date) and ($4='manager' or ${departmentSql}=$4)`,
      [this.team, from, to, profile.role],
    );
    const tasks = rows.map(taskFromRow).sort(compareTasks);
    const events = await this.query(
      `select e.* from staff_task_events e join extras_order_items i on i.team_slug=e.team_slug and i.stay_id=e.stay_id and i.order_id=e.order_id and i.id=e.item_id where i.team_slug=$1 and ($2::date is null or i.service_date >= $2::date) and ($3::date is null or i.service_date <= $3::date) and ($4='manager' or ${departmentSql}=$4) order by e.created_at,e.id`,
      [this.team, from, to, profile.role],
    );
    for (const task of tasks)
      task.history = events
        .filter((e) => e.item_id === task.id && e.order_id === task.orderId)
        .map((e) => ({
          id: String(e.id),
          actor: String(e.actor_name),
          action: String(e.action),
          detail: String(e.detail),
          createdAt: new Date(e.created_at as string).toISOString(),
        }));
    const transfers: TransferRecord[] = [];
    if (profile.role === "manager") {
      const finance = await this.query(
        `select o.id,o.house_name,o.total,o.payment_status,r.status,r.version,r.booking_reference,r.record_reference,r.note,r.updated_by,r.updated_at from extras_orders o left join staff_transfer_records r on r.team_slug=o.team_slug and r.order_id=o.id where o.team_slug=$1 and exists (select 1 from extras_order_items i where i.team_slug=o.team_slug and i.stay_id=o.stay_id and i.order_id=o.id and ($2::date is null or i.service_date >= $2::date) and ($3::date is null or i.service_date <= $3::date)) order by o.created_at,o.id`,
        [this.team, from, to],
      );
      for (const row of finance)
        transfers.push({
          orderId: String(row.id),
          orderNumber: number(String(row.id)),
          houseName: String(row.house_name),
          total: Number(row.total),
          paymentStatus: row.payment_status as TransferRecord["paymentStatus"],
          status: (row.status ?? "pending") as TransferRecord["status"],
          version: Number(row.version ?? 0),
          bookingReference: String(row.booking_reference ?? ""),
          recordReference: String(row.record_reference ?? ""),
          note: String(row.note ?? ""),
          updatedBy: row.updated_by as string | null,
          updatedAt: row.updated_at
            ? new Date(row.updated_at as string).toISOString()
            : null,
        });
    }
    return { tasks, transfers };
  }
  async execute(profile: StaffProfile, command: StaffMutation) {
    if (command.action === "transfer") {
      if (profile.role !== "manager")
        throw new StaffError("Реестр доступен управляющему.", 403);
      if (
        command.status === "transferred" &&
        (!command.bookingReference || !command.recordReference)
      )
        throw new StaffError("Укажите номер брони и записи Bnovo.", 400);
      const result = await this.query(
        `with changed as (
        insert into staff_transfer_records (team_slug,stay_id,order_id,status,version,booking_reference,record_reference,note,updated_by)
        select team_slug,stay_id,id,$4,1,$5,$6,$7,$8 from extras_orders where team_slug=$1 and id=$2 and ($3=0 or exists(select 1 from staff_transfer_records where team_slug=$1 and order_id=$2 and version=$3))
        on conflict (team_slug,order_id) do update set status=excluded.status,version=staff_transfer_records.version+1,booking_reference=excluded.booking_reference,record_reference=excluded.record_reference,note=excluded.note,updated_by=excluded.updated_by,updated_at=now() where staff_transfer_records.version=$3
        returning *
      ), logged as (
        insert into staff_transfer_events (id,team_slug,stay_id,order_id,actor_id,actor_name,status,booking_reference,record_reference,note)
        select $9,team_slug,stay_id,order_id,$10,$8,status,booking_reference,record_reference,note from changed returning id
      ) select id from logged`,
        [
          this.team,
          command.orderId,
          command.version,
          command.status,
          command.bookingReference,
          command.recordReference,
          command.note,
          profile.name,
          randomUUID(),
          profile.id,
        ],
      );
      if (!result.length)
        throw new StaffError(
          "Запись изменилась на другом устройстве. Обновите реестр.",
        );
      return;
    }
    const rows = await this.query(
      `select i.*,i.service_date::text as service_date,o.house_name,o.guests,o.comment,o.total as order_total,o.payment_status from extras_order_items i join extras_orders o on o.team_slug=i.team_slug and o.stay_id=i.stay_id and o.id=i.order_id where i.team_slug=$1 and i.order_id=$2 and i.id=$3 and ($4='manager' or ${departmentSql}=$4)`,
      [this.team, command.orderId, command.id, profile.role],
    );
    if (!rows.length) throw new StaffError("Задание недоступно.", 404);
    const task = taskFromRow(rows[0]);
    if (task.version !== command.version)
      throw new StaffError("Задание уже изменено. Обновите список.");
    let status: WorkStatus,
      confirmed: string | null,
      fulfillment: string,
      detail: string;
    if (command.action === "confirm") {
      if (profile.role !== "manager")
        throw new StaffError("Согласование доступно управляющему.", 403);
      if (task.status !== "awaiting_approval")
        throw new StaffError("Это задание не ожидает согласования.");
      const [start, end] = command.time.split("–");
      if (end && end <= start)
        throw new StaffError("Конец интервала должен быть позже начала.", 400);
      status = "new";
      confirmed = command.time;
      fulfillment = "confirmed";
      detail = `Время согласовано: ${command.time}`;
    } else {
      const next = nextWorkStatus(task.status, task.department);
      if (!next)
        throw new StaffError("Сначала проверьте оплату и согласуйте условия.");
      status = next;
      confirmed = task.confirmedTime;
      fulfillment = next === "completed" ? "completed" : "confirmed";
      detail =
        next === "in_progress"
          ? "Взято в работу"
          : next === "ready"
            ? "Готово"
            : task.department === "kitchen"
              ? "Доставлено"
              : "Выполнено";
    }
    // One statement gates the revision and payment, updates one line, and writes
    // its audit event. Sibling tasks and financial states are never updated here.
    const result = await this.query(
      `with changed as (
      update extras_order_items i set work_status=$6,confirmed_time=$7,fulfillment_status=$8,staff_version=i.staff_version+1
      from extras_orders o where i.team_slug=$1 and i.order_id=$2 and i.id=$3 and i.staff_version=$4
      and o.team_slug=i.team_slug and o.stay_id=i.stay_id and o.id=i.order_id and ${eligiblePayment}
      and i.fulfillment_status not in ('completed','cancelled') and ($5='manager' or ${departmentSql}=$5)
      returning i.*
    ), logged as (
      insert into staff_task_events(id,team_slug,stay_id,order_id,item_id,actor_id,actor_name,action,detail)
      select $9,team_slug,stay_id,order_id,id,$10,$11,$12,$13 from changed returning id
    ) select id from logged`,
      [
        this.team,
        command.orderId,
        command.id,
        command.version,
        profile.role,
        status,
        confirmed,
        fulfillment,
        randomUUID(),
        profile.id,
        profile.name,
        command.action === "confirm" ? "confirm" : status,
        detail,
      ],
    );
    if (!result.length)
      throw new StaffError("Задание или оплата изменились. Обновите список.");
  }
}
