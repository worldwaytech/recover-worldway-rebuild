import { getDepartureRequirements, getTourCancellationTerms, getTourBooking } from "@/lib/tours-booking.server";
const dep = process.argv[2]!;
console.log(JSON.stringify({
  requirements: await getDepartureRequirements(dep),
  cancellation: await getTourCancellationTerms(dep),
  bookingRead: await getTourBooking("000000"),
}, null, 1).slice(0, 2500));
