// Travelgate HotelX operation documents. Runtime execution remains behind
// the server-only client and certification gate.
export const TRAVELGATE_SEARCH_QUERY = `
query HotelSearch($criteria: HotelSearchCriteriaInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      context
      options {
        edges {
          node {
            id
            hotelCode
            hotelName
            boardCode
            paymentType
          }
        }
      }
    }
  }
}`;

export const TRAVELGATE_QUOTE_QUERY = `
query HotelQuote($criteria: HotelQuoteCriteriaInput!, $settings: HotelSettingsInput!) {
  hotelX {
    quote(criteria: $criteria, settings: $settings) {
      option { id }
      status
      price { gross { amount currency } net { amount currency } }
      cancelPolicy { refundable }
    }
  }
}`;

export const TRAVELGATE_BOOK_MUTATION = `
mutation HotelBook($criteria: HotelBookCriteriaInput!, $settings: HotelSettingsInput!) {
  hotelX {
    book(criteria: $criteria, settings: $settings) {
      booking { bookingID status clientReference supplierReference }
    }
  }
}`;

export const TRAVELGATE_READ_QUERY = `
query HotelBookingRead($criteria: HotelBookingInput!, $settings: HotelSettingsInput!) {
  hotelX {
    booking(criteria: $criteria, settings: $settings) {
      bookingID status reference { client supplier hotel }
    }
  }
}`;

export const TRAVELGATE_CANCEL_MUTATION = `
mutation HotelCancel($criteria: HotelCancelInput!, $settings: HotelSettingsInput!) {
  hotelX {
    cancel(criteria: $criteria, settings: $settings) {
      bookingID status reference { client supplier hotel }
    }
  }
}`;
