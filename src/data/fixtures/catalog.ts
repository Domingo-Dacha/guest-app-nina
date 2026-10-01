import { extrasCopy } from "./extras-copy";
import { catalogFixtureSchema } from "@/data/contracts/catalog";

export const catalogFixture = catalogFixtureSchema.parse({
  houses: [
    {
      id: "pine-house",
      name: "Дом у сосен",
      location: "Тихая опушка",
      description:
        "Светлый дом для неспешных выходных, настольных игр и прогулок.",
      image: "/houses/pine-house.jpg",
      capacity: 6,
      features: ["камин", "терраса", "вид на лес"],
    },
    {
      id: "river-house",
      name: "Дом у воды",
      location: "Берег небольшого озера",
      description:
        "Компактный дом с просторной гостиной и местом для завтрака у окна.",
      image: "/houses/river-house.jpg",
      capacity: 4,
      features: ["панорамные окна", "гриль", "настольные игры"],
    },
    {
      id: "terrace-house",
      name: "Дом с террасой",
      location: "Лесная поляна",
      description:
        "Дом для большой компании с тихими спальнями и общей зоной отдыха.",
      image: "/houses/terrace-house.jpg",
      capacity: 8,
      features: ["большая терраса", "сауна", "детская кроватка"],
    },
  ],
  services: [
    {
      id: "breakfast",
      name: "Завтрак",
      description: extrasCopy.breakfast,
      priceKopecks: 180000,
      conditions: "Заказ до 18:00 предыдущего дня.",
    },
    {
      id: "late-checkout",
      name: "Поздний выезд",
      description: extrasCopy["late-checkout"],
      priceKopecks: 350000,
      conditions: "Подтверждается командой не позднее вечера накануне.",
    },
    {
      id: "firewood",
      name: "Дополнительные дрова",
      description: "Сухие дрова и растопка для камина или костровой чаши.",
      priceKopecks: 70000,
      conditions: "Доставка в течение двух часов с 09:00 до 20:00.",
    },
  ],
  instructions: [
    {
      id: "arrival",
      title: "Как пройти в дом",
      summary: "Тестовый маршрут без адреса и действующих кодов доступа.",
      category: "arrival",
    },
    {
      id: "fireplace",
      title: "Как безопасно растопить камин",
      summary: "Короткая последовательность действий и правила безопасности.",
      category: "safety",
    },
    {
      id: "departure",
      title: "Перед выездом",
      summary: "Что выключить, где оставить ключ и как сообщить о выезде.",
      category: "departure",
    },
  ],
  booking: {
    id: "demo-booking-001",
    guestDisplayName: "Тестовый гость",
    houseId: "pine-house",
    checkIn: "2026-10-16",
    checkOut: "2026-10-18",
    guests: 4,
    checkInTime: "15:00",
  },
  recommendations: [
    {
      id: "forest-route",
      title: "Маршрут через сосновый лес",
      description:
        "Спокойная прогулка без сложных подъёмов, около пяти километров.",
      travelMinutes: 8,
      category: "nature",
    },
    {
      id: "farm-cafe",
      title: "Фермерское кафе",
      description: "Сезонное меню и большая веранда. Это вымышленный пример.",
      travelMinutes: 14,
      category: "food",
    },
    {
      id: "sup-rental",
      title: "Прогулка на сапах",
      description: extrasCopy.sup,
      travelMinutes: 18,
      category: "activity",
    },
  ],
});
