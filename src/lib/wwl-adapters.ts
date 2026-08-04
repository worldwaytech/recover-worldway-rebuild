// Client-safe pure adapter helpers shared between the server function
// implementation and unit tests.

export function toPartnerHotelPayload(data: {
  destination: string;
  check_in: string;
  check_out: string;
  guests?: number;
  rooms?: number;
}) {
  const rooms = Math.max(1, data.rooms ?? 1);
  const guests = Math.max(1, data.guests ?? 2);
  const adultsPerRoom = Math.max(1, Math.ceil(guests / rooms));
  return {
    destination: data.destination,
    checkIn: data.check_in,
    checkOut: data.check_out,
    rooms: Array.from({ length: rooms }, () => ({ adults: adultsPerRoom })),
  };
}

// Upstream partner flight schema expects `segments: [{origin, destination, date, preferredTime}]`
// for every trip type — one-way, round-trip, and multi-city. Map our UI fields to that shape.
export type FlightLeg = {
  origin: string;
  destination: string;
  date: string;
  preferredTime?: string;
};
export function toPartnerFlightPayload(data: {
  origin?: string;
  destination?: string;
  depart_date?: string;
  return_date?: string;
  legs?: FlightLeg[];
  passengers?: number;
  cabin?: string;
  trip_type?: "one_way" | "round_trip" | "multi_city";
}) {
  const timeFor = (_date: string, time?: string) => {
    // Partner API expects HH:mm; full ISO timestamps trigger "Invalid time value".
    return time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  };
  let segments: FlightLeg[] = [];
  if (data.legs && data.legs.length > 0) {
    segments = data.legs.map((l) => ({
      origin: l.origin,
      destination: l.destination,
      date: l.date,
      preferredTime: timeFor(l.date, l.preferredTime),
    }));
  } else if (data.origin && data.destination && data.depart_date) {
    segments.push({
      origin: data.origin,
      destination: data.destination,
      date: data.depart_date,
      preferredTime: timeFor(data.depart_date),
    });
    if (data.return_date && data.trip_type !== "one_way") {
      segments.push({
        origin: data.destination,
        destination: data.origin,
        date: data.return_date,
        preferredTime: timeFor(data.return_date),
      });
    }
  }
  return {
    tripType: data.trip_type ?? (segments.length > 1 ? "round_trip" : "one_way"),
    segments,
    returnDate: data.return_date,
    passengers: data.passengers ?? 1,
    cabin: data.cabin ?? "business",
  };
}

export function toPartnerTransferPayload(data: {
  pickup: string;
  dropoff: string;
  date: string;
  time?: string;
  passengers?: number;
  vehicle?: string;
}) {
  return {
    pickup: data.pickup,
    dropoff: data.dropoff,
    pickupDate: data.time ? `${data.date}T${data.time}:00.000Z` : data.date,
    pickupTime: data.time,
    passengers: data.passengers ?? 2,
    vehicle: data.vehicle,
  };
}

export function toPartnerPrivateJetPayload(data: {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  passengers: number;
  aircraft?: string;
}) {
  return {
    from: data.origin,
    to: data.destination,
    departDate: data.depart_date,
    returnDate: data.return_date,
    passengers: data.passengers,
    aircraft: data.aircraft,
  };
}
