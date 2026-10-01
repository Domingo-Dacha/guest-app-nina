import { extrasFixture } from "@/data/fixtures/extras";
import { fixtureCatalogRepository } from "@/data/repositories/fixture-catalog-repository";
import type { ExtrasCatalog, StayContext } from "@/data/contracts/extras";

export const extrasCatalogRepository = {
  async getCatalog(): Promise<ExtrasCatalog> {
    return extrasFixture;
  },
  async getStay(): Promise<StayContext> {
    const booking = await fixtureCatalogRepository.getDemoBooking();
    const house = await fixtureCatalogRepository.getHouse(booking.houseId);
    return {
      id: booking.id,
      guestName: booking.guestDisplayName,
      contact: "guest@example.test",
      houseName: house?.name ?? "Ваш дом",
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      checkInTime: booking.checkInTime,
      checkOutTime: "12:00",
      guests: booking.guests,
    };
  },
};
