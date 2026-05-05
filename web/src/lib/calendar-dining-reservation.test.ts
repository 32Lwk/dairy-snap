import { describe, expect, it } from "vitest";
import { looksLikeDiningVenueReservation } from "./calendar-dining-reservation";

describe("looksLikeDiningVenueReservation", () => {
  it("Reservation at BARBARA を飲食予約とみなす", () => {
    expect(
      looksLikeDiningVenueReservation({
        title: "Reservation at BARBARA",
      }),
    ).toBe(true);
  });

  it("opaque な会社名のみでは飲食とみなさない", () => {
    expect(
      looksLikeDiningVenueReservation({
        title: "株式会社サンプル 説明会",
      }),
    ).toBe(false);
  });

  it("description にレストランがあれば飲食とみなす", () => {
    expect(
      looksLikeDiningVenueReservation({
        title: "Meeting",
        description: "Dinner at Italian restaurant",
      }),
    ).toBe(true);
  });
});
