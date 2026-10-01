import { extrasCopy } from "./extras-copy";

import type { ExtrasCatalog } from "@/data/contracts/extras";

const furakoDescription =
  "Попробуйте новый вид парения. Бочка из лиственницы растапливается дровами.\n\nМы не добавляем никаких химикатов в воду, только натуральное парение.\n\nБочка моется, наливается свежая вода и растапливается к назначенному времени перед каждым гостем. Далее вы самостоятельно поддерживаете комфортную температуру, чтобы мы не мешали вам своим присутствием. Учитывайте, что это определённые усилия: открыть печку, подбросить брикеты, размешать воду, чтобы довести до комфортной температуры. Подробную инструкцию мы пришлём.\n\nМы всегда на связи и можем приехать помочь в случае необходимости.";

const bathTimes = Array.from({ length: 12 }, (_, index) => `${index + 10}:00`);
const robeAddon = {
  name: "Халат",
  price: 50000,
  image: {
    src: "/images/extras/robes.jpg",
    alt: "Халаты Domingo с надписью «не парься на даче»",
  },
};
const venskyDescription =
  "Уютная банька на краю посёлка у самой кромки леса. Тишина, приватность и единение с природой.\n\nКомфортно для 4 человек.\n\nВ парной дровяная печь, а на улице — бодрящая холодная купель, горячая бочка фурако и сенные качели для расслабления под открытым небом.";
const venskyConditions =
  "До бани не более 15 минут неспешной прогулки от домов Domingo Dacha в Венском Лесу и Нара Вилладж; от Игнатьево — около 15 минут на машине. Баня — 8 000 ₽ за 2 часа, с 31 декабря по 10 января включительно — 10 000 ₽, каждый следующий час — 2 500 ₽. Комплекс с фурако на 4 часа — 13 000 ₽, в новогодние праздники — 15 000 ₽. Отдельное фурако у бани — 6 000 ₽ за сеанс. Халаты и украшение бочки оплачиваются отдельно. Дату и время требуется подтвердить с менеджером.";

export const extrasFixture: ExtrasCatalog = {
  categories: [
    { id: "food", name: "Еда" },
    { id: "bath", name: "Баня и фурако" },
    { id: "experiences", name: "Впечатления" },
    { id: "occasion", name: "Особый повод" },
    { id: "comfort", name: "Комфорт" },
  ],
  rules: { timeZone: "Europe/Moscow", breakfastDeadline: "18:00", maxSets: 6 },
  services: [
    {
      id: "breakfast",
      category: "food",
      name: "Завтрак",
      summary: extrasCopy["breakfast"],
      description: extrasCopy["breakfast"],
      includes: [
        "Горячий завтрак на одного человека",
        "Выпечка и сезонное дополнение",
        "Доставка к вашему дому",
      ],
      conditions:
        "Оформите заказ до 18:00 предыдущего дня по московскому времени. Состав завтрака демонстрационный; при реальном запуске потребуется меню и информация об аллергенах.",
      price: 90000,
      unit: "за 1 человека",
      quantityLabel: "Количество человек",
      images: [
        {
          src: "/images/extras/breakfast-new.jpg",
          alt: "Завтрак с кашей, блинами и круассанами на террасе",
        },
        {
          src: "/images/extras/breakfast.jpg",
          alt: "Каша с бананом и свежие круассаны",
        },
      ],
      confirmation: "automatic",
      times: ["08:00–08:30", "09:00–09:30"],
    },
    ...(
      [
        ["lunch", "Обед", extrasCopy["lunch"], extrasCopy["lunch"]],
        ["dinner", "Ужин", extrasCopy["dinner"], extrasCopy["dinner"]],
        [
          "farm-basket",
          "Фермерская корзина",
          extrasCopy["farm-basket"],
          extrasCopy["farm-basket"],
        ],
      ] as const
    ).map(([id, name, summary, description]) => ({
      id,
      name,
      summary,
      category: "food" as const,
      images:
        id === "farm-basket"
          ? [
              {
                src: "/images/extras/farm-basket.jpg",
                alt: "Фермерская корзина: молочные продукты, хлеб и сырники",
              },
            ]
          : id === "lunch"
            ? [
                {
                  src: "/images/extras/lunch.jpg",
                  alt: "Обед: паста с грибами и овощной салат",
                },
              ]
            : id === "dinner"
              ? [
                  {
                    src: "/images/extras/burger.jpg",
                    alt: "Ужин: бургер с фирменной булочкой Domingo Dacha",
                  },
                ]
              : undefined,
      description,
      includes: [],
      conditions:
        "Состав, стоимость и условия заказа уточняются. Пока оформить эту услугу нельзя.",
      price: null,
      unit: "",
      confirmation: "manual" as const,
      times: [],
      ...(id === "farm-basket"
        ? {
            includes: [
              "Молоко — 1 л",
              "Яйца — 10 шт.",
              "Адыгейский козий сыр",
              "Хлеб ржаной домашний",
              "Подарок-сюрприз",
            ],
            conditions:
              "Доставляем фермерскую корзину к вашему дому. Заказ оформляется у Марго в Telegram.",
            telegramOrder: { username: "Margosch_ka" },
          }
        : {}),
    })),
    {
      id: "furako",
      category: "bath",
      name: "Бочка фурако",
      summary: "Тёплая вода, свежий воздух и вечер без спешки.",
      description: furakoDescription,
      includes: [
        "Подготовка и наполнение купели",
        "Нагрев воды перед вашим купанием",
        "Инструкция по использованию",
      ],
      conditions:
        "Время требует согласования. После оплаты менеджер свяжется с вами. Вы выбираете желаемое время.",
      price: 700000,
      unit: "за 1 день · 2 дня — 8 000 ₽",
      durations: [
        { days: 1, price: 700000 },
        { days: 2, price: 800000 },
      ],
      images: [
        {
          src: "/images/extras/furako-larch.jpg",
          alt: "Фурако на деревянной террасе среди деревьев",
        },
      ],
      confirmation: "manual",
      times: [
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
        "19:00",
        "20:00",
        "21:00",
      ],
      addon: { name: "Украшение в бочку", price: 200000 },
      firAddon: {
        name: "Сибирская пихта",
        price: 200000,
        image: {
          src: "/images/extras/siberian-fir.jpg",
          alt: "Сибирская пихта рядом с фурако и в воде купели",
        },
      },
      robeAddon: {
        name: "Халат",
        price: 50000,
        image: {
          src: "/images/extras/robes.jpg",
          alt: "Халаты Domingo с надписью «не парься на даче»",
        },
      },
    },
    {
      id: "sup",
      category: "experiences",
      name: "Сапы",
      summary: extrasCopy["sup"],
      description: extrasCopy["sup"],
      includes: ["Сап для прогулки", "Трансфер к старту и обратно от финиша"],
      conditions:
        "2 000 ₽ за сап. Маршрут занимает примерно 1–2 часа; время старта согласовывается отдельно. Возможность прогулки зависит от погоды и наличия оборудования.",
      price: 200000,
      unit: "за сап · маршрут около 1–2 часов",
      quantityLabel: "Количество сапов",
      confirmation: "manual",
      timing: "agreement",
      times: ["По согласованию"],
      images: [
        {
          src: "/images/extras/sup-new.jpg",
          alt: "Гости на сапах на реке среди зелёных берегов",
        },
      ],
    },
    {
      id: "late-checkout",
      images: [
        {
          src: "/images/extras/late-checkout.jpg",
          alt: "Вечер у дома Domingo: огонь, гирлянды и фурако на террасе",
        },
      ],
      category: "comfort",
      name: "Поздний выезд",
      summary: extrasCopy["late-checkout"],
      description: extrasCopy["late-checkout"],
      includes: [
        "Запрос на продление пребывания в день выезда",
        "Согласование желаемого времени с командой",
      ],
      conditions:
        "Время требует согласования. После оплаты менеджер свяжется с вами. До подтверждения действует стандартное время выезда.",
      price: 500000,
      unit: "за поздний выезд",
      confirmation: "manual",
      times: ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    },
    {
      id: "furako-vensky",
      category: "bath",
      name: "Фурако у бани «Венский»",
      summary: "Горячая бочка у бани — отдельный сеанс отдыха.",
      description: furakoDescription,
      includes: [
        "Подготовка купели и свежая вода",
        "Растопка к согласованному времени",
        "Инструкция по поддержанию температуры",
      ],
      conditions:
        "Фурако у бани — 6 000 ₽. Баня не входит в стоимость. Время и длительность согласовываются; халаты и украшение бочки можно добавить отдельно.",
      price: 600000,
      unit: "за сеанс",
      confirmation: "manual",
      times: bathTimes,
      robeAddon,
      addon: { name: "Украшение в бочку", price: 200000 },
      images: [
        {
          src: "/images/extras/furako-larch.jpg",
          alt: "Бочка фурако у бани «Венский»",
        },
      ],
    },
    ...(
      [
        [
          "bath-vensky",
          "Баня «Венский»",
          "Неспешный банный вечер и время для себя.",
          venskyDescription,
        ],
        [
          "bath-gavshino",
          "Баня «Гавшино»",
          "Тепло парной после прогулок на свежем воздухе.",
          "Баня «Гавшино» — идея для завершения дня, проведённого на свежем воздухе. После прогулок приятно сменить активный ритм на тепло парной и неторопливый отдых. В стоимость 7 500 ₽ входят 3 часа посещения, каждый дополнительный час стоит 2 500 ₽. Выберите дату, желаемое время и, при необходимости, халаты — посещение требует подтверждения.",
        ],
        [
          "bath-paradise",
          "Райская баня",
          "Только для гостей «Меридиана».",
          "Райская баня доступна только гостям «Меридиана» и может стать особой частью вашего проживания. Посвятите этот вечер себе: отложите телефон и насладитесь банным отдыхом без спешки. В стоимость 10 000 ₽ входят 3 часа посещения, продление стоит 2 500 ₽ за час. Дату и желаемое время нужно согласовать, халаты можно добавить отдельно.",
        ],
      ] as const
    ).map(([id, name, summary, description]) => ({
      id,
      name,
      category: "bath" as const,
      summary,
      description,
      includes: [],
      confirmation: "manual" as const,
      times: bathTimes,
      images: [
        {
          src:
            id === "bath-paradise"
              ? "/images/extras/sauna.jpg"
              : `/images/extras/${id}.jpg`,
          alt:
            id === "bath-paradise"
              ? "Интерьер парной — временное общее фото"
              : `Интерьер: ${name}`,
        },
      ],
      ...(id === "bath-paradise" ? { allowedHouses: ["Меридиан"] } : {}),
      robeAddon,
      ...(id === "bath-vensky"
        ? {
            price: 800000,
            newYearPrice: 1000000,
            unit: "за 2 часа · в праздники — 10 000 ₽",
            hourly: { included: 2, extraHourPrice: 250000, max: 12 },
            conditions: venskyConditions,
            packageServiceId: "bath-vensky-furako" as const,
          }
        : {
            price: id === "bath-gavshino" ? 750000 : 1000000,
            unit: "за 3 часа",
            hourly: { included: 3, extraHourPrice: 250000, max: 12 },
            conditions:
              "В стоимость включены 3 часа бани. Каждый дополнительный час — 2 500 ₽, халаты — 500 ₽ за штуку. Вы выбираете желаемое время; посещение требует подтверждения.",
          }),
    })),
    {
      id: "bath-vensky-furako",
      category: "bath",
      name: "Баня «Венский» + фурако",
      summary: "Парная и горячая купель в одном комплексе.",
      description: venskyDescription,
      includes: [
        "Баня на 2 часа",
        "Фурако на 4 часа",
        "Дополнительные часы бани — по 2 500 ₽",
      ],
      conditions: venskyConditions,
      price: 1300000,
      newYearPrice: 1500000,
      unit: "баня 2 часа + фурако 4 часа",
      confirmation: "manual",
      hourly: { included: 2, extraHourPrice: 250000, max: 12 },
      sessionHours: 4,
      times: bathTimes,
      robeAddon,
      addon: { name: "Украшение в бочку", price: 200000 },
      images: [
        {
          src: "/images/extras/bath-furako-terrace.jpg",
          alt: "Терраса комплекса «Венский» с двумя купелями",
        },
        {
          src: "/images/extras/bath-vensky.jpg",
          alt: "Баня «Венский»: парная с панорамным окном",
        },
      ],
    },
    {
      id: "bicycles",
      retired: true,
      category: "experiences",
      name: "Велосипеды",
      summary: "Откройте окрестности во время велосипедной прогулки.",
      description:
        "Отправляйтесь знакомиться с окрестностями на велосипеде и выбирайте удобный для себя темп. Делайте остановки ради красивых видов, фотографий и небольших открытий по пути. Для гостей велосипеды предоставляются бесплатно — укажите дату и нужное количество. Наличие, время выдачи и возврата потребуется согласовать заранее.",
      includes: ["Пользование велосипедом"],
      conditions:
        "Бесплатно. Наличие, время выдачи и возврата согласовываются. После оформления заявка останется на согласовании.",
      price: 0,
      unit: "для гостей",
      quantityLabel: "Количество велосипедов",
      confirmation: "manual",
      timing: "agreement",
      times: ["По согласованию"],
      images: [
        {
          src: "/images/extras/bicycles-new.jpg",
          alt: "Велосипеды на прогулке по окрестностям",
        },
      ],
    },
    {
      id: "firewood",
      category: "comfort",
      name: "Дрова",
      summary: "Запас дров для уютного вечера у огня.",
      description:
        "Добавьте к отдыху дрова, чтобы провести вечер у огня. Одна упаковка весом 5 кг стоит 1 000 ₽. Выберите нужное количество упаковок и дату. Время передачи дров согласовывается отдельно.",
      includes: ["5 кг дров в каждой упаковке"],
      conditions:
        "Укажите дату и количество упаковок. Время передачи и наличие требуют подтверждения.",
      price: 100000,
      unit: "за 5 кг",
      quantityLabel: "Количество упаковок по 5 кг",
      confirmation: "manual",
      timing: "agreement",
      times: ["По согласованию"],
    },
  ],
};
