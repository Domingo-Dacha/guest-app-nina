import { AppShell } from "@/components/domingo/app-shell";
import { HouseCard } from "@/components/domingo/house-card";
import { RequestDemo } from "@/components/domingo/request-demo";
import { fixtureCatalogRepository } from "@/data/repositories/fixture-catalog-repository";
import { requirePageSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

function money(kopecks: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}

export default async function Home() {
  await requirePageSession();
  const [houses, services, instructions, booking, recommendations] =
    await Promise.all([
      fixtureCatalogRepository.listHouses(),
      fixtureCatalogRepository.listServices(),
      fixtureCatalogRepository.listInstructions(),
      fixtureCatalogRepository.getDemoBooking(),
      fixtureCatalogRepository.listRecommendations(),
    ]);
  const bookedHouse = houses.find((house) => house.id === booking.houseId);

  return (
    <AppShell>
      <section className="hero">
        <p className="status-badge">Команда Нина готова</p>
        <p className="eyebrow">Универсальный старт команды</p>
        <h1>Соберите полезный гостевой сценарий</h1>
        <p>
          Здесь нет заранее выбранного продукта. Используйте компоненты,
          тестовые данные и серверные заявки, чтобы быстро проверить свою идею.
        </p>
      </section>
      <section className="section" aria-labelledby="houses-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Общие fixtures</p>
            <h2 id="houses-title">Три тестовых дома</h2>
          </div>
          <span className="status-badge">Демо-данные</span>
        </div>
        <div className="house-grid">
          {houses.map((house) => (
            <HouseCard house={house} key={house.id} />
          ))}
        </div>
      </section>
      <section className="section split-grid" aria-label="Бронь и услуги">
        <article className="feature-panel feature-panel--brand">
          <p className="eyebrow">Тестовое проживание</p>
          <h2>{bookedHouse?.name ?? "Дом"}</h2>
          <dl className="booking-details">
            <div>
              <dt>Гость</dt>
              <dd>{booking.guestDisplayName}</dd>
            </div>
            <div>
              <dt>Даты</dt>
              <dd>
                {booking.checkIn} — {booking.checkOut}
              </dd>
            </div>
            <div>
              <dt>Заезд</dt>
              <dd>после {booking.checkInTime}</dd>
            </div>
            <div>
              <dt>Гостей</dt>
              <dd>{booking.guests}</dd>
            </div>
          </dl>
        </article>
        <article className="feature-panel">
          <p className="eyebrow">Можно подключить к сценарию</p>
          <h2>Дополнительные услуги</h2>
          <ul className="stack-list">
            {services.map((service) => (
              <li key={service.id}>
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.conditions}</span>
                </div>
                <b>{money(service.priceKopecks)}</b>
              </li>
            ))}
          </ul>
        </article>
      </section>
      <section
        className="section split-grid"
        aria-label="Инструкции и рекомендации"
      >
        <article className="feature-panel">
          <p className="eyebrow">Подсказки гостю</p>
          <h2>Инструкции</h2>
          <ul className="numbered-list">
            {instructions.map((instruction, index) => (
              <li key={instruction.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{instruction.title}</strong>
                  <p>{instruction.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
        <article className="feature-panel">
          <p className="eyebrow">Чем заняться</p>
          <h2>Рядом с домом</h2>
          <ul className="stack-list stack-list--cards">
            {recommendations.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </div>
                <b>{item.travelMinutes} мин</b>
              </li>
            ))}
          </ul>
        </article>
      </section>
      <section className="section" aria-labelledby="request-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Серверный пример</p>
            <h2 id="request-title">Тестовая заявка</h2>
          </div>
        </div>
        <RequestDemo />
      </section>
    </AppShell>
  );
}
