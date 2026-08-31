import { getTourCancellationTerms, getTourBooking } from "@/lib/tours-booking.server";
console.log(JSON.stringify(await getTourCancellationTerms(process.argv[2]!)).slice(0,900));
console.log(JSON.stringify(await getTourBooking("000000")).slice(0,400));
