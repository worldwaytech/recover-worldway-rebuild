// RateHawk / ETG API v3 operation paths.
// Execution remains behind the server-only client and certification gate.

export const RATEHAWK_OPERATIONS = {
  searchRegion: "/serp/region/",
  hotelPage: "/hotel/info/",
  prebookHotelPage: "/hotel/prebook/",
  prebookSearch: "/serp/prebook/",
  bookingForm: "/hotel/order/booking/form/",
  bookingFinish: "/hotel/order/booking/finish/",
  bookingFinishStatus: "/hotel/order/booking/finish/status/",
  bookingInfo: "/hotel/order/info/",
  bookingCancel: "/hotel/order/cancel/",
} as const;

export type RateHawkOperation = keyof typeof RATEHAWK_OPERATIONS;
