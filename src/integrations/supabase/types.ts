export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aviation_inquiries: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          intent: string
          leg_id: string | null
          notes: string | null
          passengers: number | null
          phone: string
          source: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          intent: string
          leg_id?: string | null
          notes?: string | null
          passengers?: number | null
          phone: string
          source?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          intent?: string
          leg_id?: string | null
          notes?: string | null
          passengers?: number | null
          phone?: string
          source?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_documents: {
        Row: {
          booking_id: string
          content: Json
          created_at: string
          doc_type: string
          id: string
          issued_at: string
          reference: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          content?: Json
          created_at?: string
          doc_type: string
          id?: string
          issued_at?: string
          reference: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          content?: Json
          created_at?: string
          doc_type?: string
          id?: string
          issued_at?: string
          reference?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          actor_label: string
          booking_id: string
          created_at: string
          detail: Json
          event_type: string
          id: string
          summary: string
          visibility: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          booking_id: string
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          summary: string
          visibility?: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          booking_id?: string
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          summary?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_installments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          due_date: string
          id: string
          label: string
          paid_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          label: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          label?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_installments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          author_id: string | null
          author_label: string
          body: string
          booking_id: string
          created_at: string
          id: string
          internal: boolean
        }
        Insert: {
          author_id?: string | null
          author_label?: string
          body: string
          booking_id: string
          created_at?: string
          id?: string
          internal?: boolean
        }
        Update: {
          author_id?: string | null
          author_label?: string
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          gateway_reference: string | null
          id: string
          idempotency_key: string | null
          kind: string
          method: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          method?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          method?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          booking_id: string
          created_at: string
          details: string
          handled_by: string | null
          id: string
          refund_amount: number | null
          request_type: string
          resolution: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          details: string
          handled_by?: string | null
          id?: string
          refund_amount?: number | null
          request_type: string
          resolution?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          details?: string
          handled_by?: string | null
          id?: string
          refund_amount?: number | null
          request_type?: string
          resolution?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount: number | null
          amount_paid: number
          assigned_to: string | null
          balance_due: number
          cancellation_reason: string | null
          created_at: string
          currency: string
          deposit_amount: number | null
          details: Json
          id: string
          idempotency_key: string | null
          product_type: string
          reference: string
          sla_due_at: string | null
          status: string
          supplier: string | null
          supplier_reference: string | null
          supplier_status: string
          title: string
          travel_date: string | null
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          amount_paid?: number
          assigned_to?: string | null
          balance_due?: number
          cancellation_reason?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          details?: Json
          id?: string
          idempotency_key?: string | null
          product_type: string
          reference: string
          sla_due_at?: string | null
          status?: string
          supplier?: string | null
          supplier_reference?: string | null
          supplier_status?: string
          title: string
          travel_date?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          amount_paid?: number
          assigned_to?: string | null
          balance_due?: number
          cancellation_reason?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          details?: Json
          id?: string
          idempotency_key?: string | null
          product_type?: string
          reference?: string
          sla_due_at?: string | null
          status?: string
          supplier?: string | null
          supplier_reference?: string | null
          supplier_status?: string
          title?: string
          travel_date?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_events: {
        Row: {
          created_at: string
          event_type: string
          filters: Json
          id: string
          kind: string | null
          query: string | null
          slug: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          filters?: Json
          id?: string
          kind?: string | null
          query?: string | null
          slug?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          filters?: Json
          id?: string
          kind?: string | null
          query?: string | null
          slug?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cruisea_booking_documents: {
        Row: {
          booking_id: string
          created_at: string
          document_type: string
          document_url: string | null
          id: string
          issued_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          document_type: string
          document_url?: string | null
          id?: string
          issued_at?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          document_type?: string
          document_url?: string | null
          id?: string
          issued_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruisea_booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cruisea_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      cruisea_booking_passengers: {
        Row: {
          booking_id: string
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          last_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          last_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          last_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruisea_booking_passengers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cruisea_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      cruisea_bookings: {
        Row: {
          booking_reference: string | null
          cabin_id: string
          commission_amount: number
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          currency: string
          guest_count: number
          hold_expires_at: string | null
          id: string
          net_price: number
          notes: string | null
          payment_status: string
          sailing_id: string
          status: string
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_reference?: string | null
          cabin_id: string
          commission_amount?: number
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          guest_count: number
          hold_expires_at?: string | null
          id?: string
          net_price?: number
          notes?: string | null
          payment_status?: string
          sailing_id: string
          status?: string
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_reference?: string | null
          cabin_id?: string
          commission_amount?: number
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          guest_count?: number
          hold_expires_at?: string | null
          id?: string
          net_price?: number
          notes?: string | null
          payment_status?: string
          sailing_id?: string
          status?: string
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruisea_bookings_cabin_id_fkey"
            columns: ["cabin_id"]
            isOneToOne: false
            referencedRelation: "cruisea_cabins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cruisea_bookings_sailing_id_fkey"
            columns: ["sailing_id"]
            isOneToOne: false
            referencedRelation: "cruisea_sailings"
            referencedColumns: ["id"]
          },
        ]
      }
      cruisea_cabins: {
        Row: {
          available_inventory: number
          category: string
          created_at: string
          id: string
          label: string
          price_per_guest: number
          sailing_id: string
          updated_at: string
        }
        Insert: {
          available_inventory: number
          category: string
          created_at?: string
          id?: string
          label: string
          price_per_guest: number
          sailing_id: string
          updated_at?: string
        }
        Update: {
          available_inventory?: number
          category?: string
          created_at?: string
          id?: string
          label?: string
          price_per_guest?: number
          sailing_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruisea_cabins_sailing_id_fkey"
            columns: ["sailing_id"]
            isOneToOne: false
            referencedRelation: "cruisea_sailings"
            referencedColumns: ["id"]
          },
        ]
      }
      cruisea_customer_profiles: {
        Row: {
          agency_code: string | null
          company_name: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          preferred_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_code?: string | null
          company_name?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferred_currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_code?: string | null
          company_name?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferred_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cruisea_quotations: {
        Row: {
          booking_id: string | null
          commission_amount: number
          created_at: string
          currency: string
          customer_name: string
          gross_price: number
          id: string
          net_price: number
          notes: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          booking_id?: string | null
          commission_amount?: number
          created_at?: string
          currency?: string
          customer_name: string
          gross_price?: number
          id?: string
          net_price?: number
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          booking_id?: string | null
          commission_amount?: number
          created_at?: string
          currency?: string
          customer_name?: string
          gross_price?: number
          id?: string
          net_price?: number
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cruisea_quotations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "cruisea_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      cruisea_sailings: {
        Row: {
          area_tags: string[]
          country: string
          created_at: string
          cruise_line: string
          cruise_type: string
          departure_date: string
          description: string
          disembarkation_port: string
          duration_nights: number
          embarkation_port: string
          highlights: string[]
          id: string
          image_url: string | null
          is_demo: boolean
          package_options: string[]
          region: string
          ship_name: string
          title: string
          updated_at: string
        }
        Insert: {
          area_tags?: string[]
          country: string
          created_at?: string
          cruise_line: string
          cruise_type: string
          departure_date: string
          description: string
          disembarkation_port: string
          duration_nights: number
          embarkation_port: string
          highlights?: string[]
          id?: string
          image_url?: string | null
          is_demo?: boolean
          package_options?: string[]
          region: string
          ship_name: string
          title: string
          updated_at?: string
        }
        Update: {
          area_tags?: string[]
          country?: string
          created_at?: string
          cruise_line?: string
          cruise_type?: string
          departure_date?: string
          description?: string
          disembarkation_port?: string
          duration_nights?: number
          embarkation_port?: string
          highlights?: string[]
          id?: string
          image_url?: string | null
          is_demo?: boolean
          package_options?: string[]
          region?: string
          ship_name?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cruisea_saved_searches: {
        Row: {
          company: string | null
          created_at: string
          cruise_type: string | null
          departure_date: string | null
          departure_window: string | null
          duration: string | null
          id: string
          is_active: boolean
          name: string
          package_filters: string[]
          query: string | null
          region: string | null
          ship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          cruise_type?: string | null
          departure_date?: string | null
          departure_window?: string | null
          duration?: string | null
          id?: string
          is_active?: boolean
          name: string
          package_filters?: string[]
          query?: string | null
          region?: string | null
          ship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          cruise_type?: string | null
          departure_date?: string | null
          departure_window?: string | null
          duration?: string | null
          id?: string
          is_active?: boolean
          name?: string
          package_filters?: string[]
          query?: string | null
          region?: string | null
          ship?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string
          expires_on: string | null
          file_path: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          expires_on?: string | null
          file_path?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          expires_on?: string | null
          file_path?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hbx_activities: {
        Row: {
          amount_from: number | null
          categories: Json
          city: string | null
          code: string
          country_code: string | null
          created_at: string
          currency: string | null
          description: string | null
          destination_code: string | null
          destination_name: string | null
          duration: string | null
          environment: string
          highlights: Json
          id: string
          images: Json
          languages: Json
          latitude: number | null
          longitude: number | null
          name: string
          supplier_payload: Json
          supplier_updated_at: string | null
          synced_at: string
          type: string | null
          updated_at: string
        }
        Insert: {
          amount_from?: number | null
          categories?: Json
          city?: string | null
          code: string
          country_code?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          destination_code?: string | null
          destination_name?: string | null
          duration?: string | null
          environment?: string
          highlights?: Json
          id?: string
          images?: Json
          languages?: Json
          latitude?: number | null
          longitude?: number | null
          name: string
          supplier_payload?: Json
          supplier_updated_at?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount_from?: number | null
          categories?: Json
          city?: string | null
          code?: string
          country_code?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          destination_code?: string | null
          destination_name?: string | null
          duration?: string | null
          environment?: string
          highlights?: Json
          id?: string
          images?: Json
          languages?: Json
          latitude?: number | null
          longitude?: number | null
          name?: string
          supplier_payload?: Json
          supplier_updated_at?: string | null
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hbx_destinations: {
        Row: {
          code: string
          country_code: string | null
          created_at: string
          environment: string
          id: string
          name: string
          supplier_payload: Json
          synced_at: string
          type: string | null
          updated_at: string
        }
        Insert: {
          code: string
          country_code?: string | null
          created_at?: string
          environment?: string
          id?: string
          name: string
          supplier_payload?: Json
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          country_code?: string | null
          created_at?: string
          environment?: string
          id?: string
          name?: string
          supplier_payload?: Json
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hbx_hotels: {
        Row: {
          address: string | null
          board_codes: Json
          category_code: string | null
          category_name: string | null
          city: string | null
          code: string
          country_code: string | null
          created_at: string
          description: string | null
          destination_code: string | null
          destination_name: string | null
          environment: string
          facilities: Json
          id: string
          images: Json
          latitude: number | null
          longitude: number | null
          name: string
          phones: Json
          postal_code: string | null
          ranking: number | null
          segment_codes: Json
          star_rating: number | null
          state_code: string | null
          supplier_payload: Json
          supplier_updated_at: string | null
          synced_at: string
          updated_at: string
          zone_code: string | null
          zone_name: string | null
        }
        Insert: {
          address?: string | null
          board_codes?: Json
          category_code?: string | null
          category_name?: string | null
          city?: string | null
          code: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          destination_code?: string | null
          destination_name?: string | null
          environment?: string
          facilities?: Json
          id?: string
          images?: Json
          latitude?: number | null
          longitude?: number | null
          name: string
          phones?: Json
          postal_code?: string | null
          ranking?: number | null
          segment_codes?: Json
          star_rating?: number | null
          state_code?: string | null
          supplier_payload?: Json
          supplier_updated_at?: string | null
          synced_at?: string
          updated_at?: string
          zone_code?: string | null
          zone_name?: string | null
        }
        Update: {
          address?: string | null
          board_codes?: Json
          category_code?: string | null
          category_name?: string | null
          city?: string | null
          code?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          destination_code?: string | null
          destination_name?: string | null
          environment?: string
          facilities?: Json
          id?: string
          images?: Json
          latitude?: number | null
          longitude?: number | null
          name?: string
          phones?: Json
          postal_code?: string | null
          ranking?: number | null
          segment_codes?: Json
          star_rating?: number | null
          state_code?: string | null
          supplier_payload?: Json
          supplier_updated_at?: string | null
          synced_at?: string
          updated_at?: string
          zone_code?: string | null
          zone_name?: string | null
        }
        Relationships: []
      }
      hbx_sync_runs: {
        Row: {
          created: number
          created_at: string
          cursor: string | null
          detail: Json
          environment: string
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          received: number
          resource: string
          started_at: string
          status: string
          suite: string
          unchanged: number
          updated: number
          updated_at: string
        }
        Insert: {
          created?: number
          created_at?: string
          cursor?: string | null
          detail?: Json
          environment?: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          received?: number
          resource?: string
          started_at?: string
          status?: string
          suite: string
          unchanged?: number
          updated?: number
          updated_at?: string
        }
        Update: {
          created?: number
          created_at?: string
          cursor?: string | null
          detail?: Json
          environment?: string
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          received?: number
          resource?: string
          started_at?: string
          status?: string
          suite?: string
          unchanged?: number
          updated?: number
          updated_at?: string
        }
        Relationships: []
      }
      hbx_transfer_routes: {
        Row: {
          code: string
          content: Json
          country_code: string | null
          created_at: string
          destination_code: string | null
          destination_name: string | null
          environment: string
          from_code: string | null
          from_name: string | null
          from_type: string | null
          id: string
          supplier_payload: Json
          synced_at: string
          to_code: string | null
          to_name: string | null
          to_type: string | null
          updated_at: string
          vehicle_categories: Json
        }
        Insert: {
          code: string
          content?: Json
          country_code?: string | null
          created_at?: string
          destination_code?: string | null
          destination_name?: string | null
          environment?: string
          from_code?: string | null
          from_name?: string | null
          from_type?: string | null
          id?: string
          supplier_payload?: Json
          synced_at?: string
          to_code?: string | null
          to_name?: string | null
          to_type?: string | null
          updated_at?: string
          vehicle_categories?: Json
        }
        Update: {
          code?: string
          content?: Json
          country_code?: string | null
          created_at?: string
          destination_code?: string | null
          destination_name?: string | null
          environment?: string
          from_code?: string | null
          from_name?: string | null
          from_type?: string | null
          id?: string
          supplier_payload?: Json
          synced_at?: string
          to_code?: string | null
          to_name?: string | null
          to_type?: string | null
          updated_at?: string
          vehicle_categories?: Json
        }
        Relationships: []
      }
      integration_audit: {
        Row: {
          action: string
          actor: string | null
          actor_email: string | null
          created_at: string
          detail: Json
          id: string
          provider_key: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_email?: string | null
          created_at?: string
          detail?: Json
          id?: string
          provider_key?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_email?: string | null
          created_at?: string
          detail?: Json
          id?: string
          provider_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_provider_fk"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      integration_logs: {
        Row: {
          attempts: number | null
          created_at: string
          detail: Json
          http_status: number | null
          id: string
          latency_ms: number | null
          level: string
          message: string | null
          operation: string
          provider_key: string
          run_id: string | null
          status: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          detail?: Json
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          level?: string
          message?: string | null
          operation: string
          provider_key: string
          run_id?: string | null
          status?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          detail?: Json
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          level?: string
          message?: string | null
          operation?: string
          provider_key?: string
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_provider_fk"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      integration_products: {
        Row: {
          availability_state: string | null
          conflict_state: string
          created_at: string
          currency: string | null
          detail_path: string | null
          external_id: string
          fingerprint: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          price_from: number | null
          product_type: string
          provider_key: string
          slug: string | null
          source_table: string | null
          supplier_record: Json
          sync_status: string
          title: string
          updated_at: string
        }
        Insert: {
          availability_state?: string | null
          conflict_state?: string
          created_at?: string
          currency?: string | null
          detail_path?: string | null
          external_id: string
          fingerprint?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          price_from?: number | null
          product_type?: string
          provider_key: string
          slug?: string | null
          source_table?: string | null
          supplier_record?: Json
          sync_status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          availability_state?: string | null
          conflict_state?: string
          created_at?: string
          currency?: string | null
          detail_path?: string | null
          external_id?: string
          fingerprint?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          price_from?: number | null
          product_type?: string
          provider_key?: string
          slug?: string | null
          source_table?: string | null
          supplier_record?: Json
          sync_status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_products_provider_fk"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      integration_providers: {
        Row: {
          adapter: string | null
          auth_header: string | null
          auth_kind: string
          auto_sync_enabled: boolean
          auto_sync_interval_minutes: number
          base_url: string
          cache_ttl_seconds: number
          capabilities: string[]
          category: string
          collections: string[]
          conflict_policy: string
          connection_checked_at: string | null
          connection_detail: string | null
          connection_state: string
          contract_status: string
          created_at: string
          created_by: string | null
          dedupe_keys: string[]
          docs_url: string | null
          enabled: boolean
          endpoints: Json
          field_map: Json
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          max_retries: number
          name: string
          notes: string | null
          origin: string
          pagination: Json
          provider_key: string
          rate_limit_per_second: number
          record_path: string | null
          scope: string | null
          secret_names: string[]
          summary: string
          sync_strategy: string
          timeout_ms: number
          token_path: string | null
          updated_at: string
          webhook_secret_name: string | null
        }
        Insert: {
          adapter?: string | null
          auth_header?: string | null
          auth_kind?: string
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          base_url?: string
          cache_ttl_seconds?: number
          capabilities?: string[]
          category?: string
          collections?: string[]
          conflict_policy?: string
          connection_checked_at?: string | null
          connection_detail?: string | null
          connection_state?: string
          contract_status?: string
          created_at?: string
          created_by?: string | null
          dedupe_keys?: string[]
          docs_url?: string | null
          enabled?: boolean
          endpoints?: Json
          field_map?: Json
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          max_retries?: number
          name: string
          notes?: string | null
          origin?: string
          pagination?: Json
          provider_key: string
          rate_limit_per_second?: number
          record_path?: string | null
          scope?: string | null
          secret_names?: string[]
          summary?: string
          sync_strategy?: string
          timeout_ms?: number
          token_path?: string | null
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Update: {
          adapter?: string | null
          auth_header?: string | null
          auth_kind?: string
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          base_url?: string
          cache_ttl_seconds?: number
          capabilities?: string[]
          category?: string
          collections?: string[]
          conflict_policy?: string
          connection_checked_at?: string | null
          connection_detail?: string | null
          connection_state?: string
          contract_status?: string
          created_at?: string
          created_by?: string | null
          dedupe_keys?: string[]
          docs_url?: string | null
          enabled?: boolean
          endpoints?: Json
          field_map?: Json
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          max_retries?: number
          name?: string
          notes?: string | null
          origin?: string
          pagination?: Json
          provider_key?: string
          rate_limit_per_second?: number
          record_path?: string | null
          scope?: string | null
          secret_names?: string[]
          summary?: string
          sync_strategy?: string
          timeout_ms?: number
          token_path?: string | null
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          global_auto_sync: boolean
          global_enabled: boolean
          id: boolean
          maintenance_paused: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          global_auto_sync?: boolean
          global_enabled?: boolean
          id?: boolean
          maintenance_paused?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          global_auto_sync?: boolean
          global_enabled?: boolean
          id?: boolean
          maintenance_paused?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      integration_sync_runs: {
        Row: {
          attempts: number
          created_count: number
          cursor: string | null
          discovered: number
          duration_ms: number | null
          error: string | null
          external_id: string | null
          failed_count: number
          finished_at: string | null
          id: string
          idempotency_key: string | null
          initiated_by: string | null
          provider_key: string
          scope: string
          started_at: string
          status: string
          trigger: string
          unchanged_count: number
          updated_count: number
        }
        Insert: {
          attempts?: number
          created_count?: number
          cursor?: string | null
          discovered?: number
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          provider_key: string
          scope?: string
          started_at?: string
          status?: string
          trigger?: string
          unchanged_count?: number
          updated_count?: number
        }
        Update: {
          attempts?: number
          created_count?: number
          cursor?: string | null
          discovered?: number
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          provider_key?: string
          scope?: string
          started_at?: string
          status?: string
          trigger?: string
          unchanged_count?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_provider_fk"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      integration_webhook_events: {
        Row: {
          attempts: number
          error: string | null
          event_id: string | null
          event_type: string | null
          id: string
          payload: Json
          payload_hash: string | null
          processed: boolean
          processed_at: string | null
          provider_key: string
          received_at: string
          signature_algorithm: string | null
          signature_valid: boolean
        }
        Insert: {
          attempts?: number
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          payload_hash?: string | null
          processed?: boolean
          processed_at?: string | null
          provider_key: string
          received_at?: string
          signature_algorithm?: string | null
          signature_valid?: boolean
        }
        Update: {
          attempts?: number
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          payload_hash?: string | null
          processed?: boolean
          processed_at?: string | null
          provider_key?: string
          received_at?: string
          signature_algorithm?: string | null
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_events_provider_fk"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          marketing_enabled: boolean
          sms_enabled: boolean
          trip_alerts: boolean
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          sms_enabled?: boolean
          trip_alerts?: boolean
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          sms_enabled?: boolean
          trip_alerts?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          booking_id: string | null
          channel: string
          created_at: string
          event: string
          id: string
          read_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          booking_id?: string | null
          channel?: string
          created_at?: string
          event: string
          id?: string
          read_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          channel?: string
          created_at?: string
          event?: string
          id?: string
          read_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_phone: string | null
          description: string | null
          failure_reason: string | null
          fulfilled_at: string | null
          fulfilment_reference: string | null
          id: string
          order_id: string
          payment_id: string | null
          plan_id: string | null
          provider: string
          provider_payload: Json | null
          purpose: string
          reference: Json
          status: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          description?: string | null
          failure_reason?: string | null
          fulfilled_at?: string | null
          fulfilment_reference?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          plan_id?: string | null
          provider?: string
          provider_payload?: Json | null
          purpose: string
          reference?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          description?: string | null
          failure_reason?: string | null
          fulfilled_at?: string | null
          fulfilment_reference?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          plan_id?: string | null
          provider?: string
          provider_payload?: Json | null
          purpose?: string
          reference?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          budget: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          party_size: number | null
          phone: string | null
          product_kind: string
          product_slug: string
          product_title: string
          status: string
          travel_month: string | null
          user_id: string | null
        }
        Insert: {
          budget?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          party_size?: number | null
          phone?: string | null
          product_kind: string
          product_slug: string
          product_title: string
          status?: string
          travel_month?: string | null
          user_id?: string | null
        }
        Update: {
          budget?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          party_size?: number | null
          phone?: string | null
          product_kind?: string
          product_slug?: string
          product_title?: string
          status?: string
          travel_month?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      saved_items: {
        Row: {
          created_at: string
          details: Json
          id: string
          item_type: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          item_type: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          item_type?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      travellers: {
        Row: {
          created_at: string
          date_of_birth: string | null
          frequent_flyer: string | null
          full_name: string
          id: string
          nationality: string | null
          passport_expiry: string | null
          passport_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          frequent_flyer?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          frequent_flyer?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tripjack_api_logs: {
        Row: {
          capability: string
          correlation_id: string
          created_at: string
          duration_ms: number
          environment: string
          error_kind: string | null
          id: string
          method: string
          outcome: string
          path: string
          request_body: Json | null
          request_query: Json | null
          response_body: Json | null
          response_status: number | null
          suite: string
          supplier_booking_id: string | null
          test_case: string | null
        }
        Insert: {
          capability: string
          correlation_id: string
          created_at?: string
          duration_ms?: number
          environment?: string
          error_kind?: string | null
          id?: string
          method: string
          outcome: string
          path: string
          request_body?: Json | null
          request_query?: Json | null
          response_body?: Json | null
          response_status?: number | null
          suite: string
          supplier_booking_id?: string | null
          test_case?: string | null
        }
        Update: {
          capability?: string
          correlation_id?: string
          created_at?: string
          duration_ms?: number
          environment?: string
          error_kind?: string | null
          id?: string
          method?: string
          outcome?: string
          path?: string
          request_body?: Json | null
          request_query?: Json | null
          response_body?: Json | null
          response_status?: number | null
          suite?: string
          supplier_booking_id?: string | null
          test_case?: string | null
        }
        Relationships: []
      }
      tripjack_certification_cases: {
        Row: {
          case_key: string
          confirmation_numbers: Json
          correlation_ids: Json
          created_at: string
          id: string
          notes: string | null
          status: string
          suite: string
          supplier_booking_id: string | null
          updated_at: string
          updated_by: string | null
          worldway_booking_id: string | null
        }
        Insert: {
          case_key: string
          confirmation_numbers?: Json
          correlation_ids?: Json
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          suite: string
          supplier_booking_id?: string | null
          updated_at?: string
          updated_by?: string | null
          worldway_booking_id?: string | null
        }
        Update: {
          case_key?: string
          confirmation_numbers?: Json
          correlation_ids?: Json
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          suite?: string
          supplier_booking_id?: string | null
          updated_at?: string
          updated_by?: string | null
          worldway_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tripjack_certification_cases_worldway_booking_id_fkey"
            columns: ["worldway_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ttc_sync_runs: {
        Row: {
          brand: string
          created_at: string
          cursor: string | null
          detail: Json
          discovered: number
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          imported: number
          resource: string
          source: string
          started_at: string
          status: string
          unchanged: number
          updated: number
          updated_at: string
        }
        Insert: {
          brand?: string
          created_at?: string
          cursor?: string | null
          detail?: Json
          discovered?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          imported?: number
          resource?: string
          source?: string
          started_at?: string
          status?: string
          unchanged?: number
          updated?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          created_at?: string
          cursor?: string | null
          detail?: Json
          discovered?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          imported?: number
          resource?: string
          source?: string
          started_at?: string
          status?: string
          unchanged?: number
          updated?: number
          updated_at?: string
        }
        Relationships: []
      }
      ttc_tours: {
        Row: {
          accommodation: Json
          api_synced_at: string | null
          brand: string
          brand_label: string | null
          content_hash: string | null
          countries: Json
          created_at: string
          departures: Json
          description: string | null
          destinations: Json
          duration_days: number | null
          duration_nights: number | null
          end_city: string | null
          exclusions: Json
          group_size: string | null
          group_size_max: number | null
          hero_image: string | null
          highlights: Json
          id: string
          images: Json
          inclusions: Json
          itinerary: Json
          locale: string
          meals: Json
          name: string
          price_currency: string | null
          price_from: number | null
          price_note: string | null
          review_count: number | null
          review_rating: number | null
          seasons: Json
          source: string
          source_payload: Json
          source_scraped_at: string | null
          source_url: string
          start_city: string | null
          subtitle: string | null
          summary: string | null
          supplier_option_id: string | null
          supplier_tour_id: string | null
          synced_at: string
          tour_options: Json
          tour_slug: string
          tour_style: string | null
          transport: Json
          trip_type: string | null
          updated_at: string
        }
        Insert: {
          accommodation?: Json
          api_synced_at?: string | null
          brand: string
          brand_label?: string | null
          content_hash?: string | null
          countries?: Json
          created_at?: string
          departures?: Json
          description?: string | null
          destinations?: Json
          duration_days?: number | null
          duration_nights?: number | null
          end_city?: string | null
          exclusions?: Json
          group_size?: string | null
          group_size_max?: number | null
          hero_image?: string | null
          highlights?: Json
          id?: string
          images?: Json
          inclusions?: Json
          itinerary?: Json
          locale?: string
          meals?: Json
          name: string
          price_currency?: string | null
          price_from?: number | null
          price_note?: string | null
          review_count?: number | null
          review_rating?: number | null
          seasons?: Json
          source?: string
          source_payload?: Json
          source_scraped_at?: string | null
          source_url: string
          start_city?: string | null
          subtitle?: string | null
          summary?: string | null
          supplier_option_id?: string | null
          supplier_tour_id?: string | null
          synced_at?: string
          tour_options?: Json
          tour_slug: string
          tour_style?: string | null
          transport?: Json
          trip_type?: string | null
          updated_at?: string
        }
        Update: {
          accommodation?: Json
          api_synced_at?: string | null
          brand?: string
          brand_label?: string | null
          content_hash?: string | null
          countries?: Json
          created_at?: string
          departures?: Json
          description?: string | null
          destinations?: Json
          duration_days?: number | null
          duration_nights?: number | null
          end_city?: string | null
          exclusions?: Json
          group_size?: string | null
          group_size_max?: number | null
          hero_image?: string | null
          highlights?: Json
          id?: string
          images?: Json
          inclusions?: Json
          itinerary?: Json
          locale?: string
          meals?: Json
          name?: string
          price_currency?: string | null
          price_from?: number | null
          price_note?: string | null
          review_count?: number | null
          review_rating?: number | null
          seasons?: Json
          source?: string
          source_payload?: Json
          source_scraped_at?: string | null
          source_url?: string
          start_city?: string | null
          subtitle?: string | null
          summary?: string | null
          supplier_option_id?: string | null
          supplier_tour_id?: string | null
          synced_at?: string
          tour_options?: Json
          tour_slug?: string
          tour_style?: string | null
          transport?: Json
          trip_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      up17_bus_cities: {
        Row: {
          city_id: string
          city_name: string
          id: number
          priority: number
        }
        Insert: {
          city_id: string
          city_name: string
          id?: number
          priority?: number
        }
        Update: {
          city_id?: string
          city_name?: string
          id?: number
          priority?: number
        }
        Relationships: []
      }
      up17_hotel_cities: {
        Row: {
          city_id: string
          country: string | null
          country_code: string | null
          destination: string
          id: number
          priority: number
          state_province: string | null
          state_province_code: string | null
        }
        Insert: {
          city_id: string
          country?: string | null
          country_code?: string | null
          destination: string
          id?: number
          priority?: number
          state_province?: string | null
          state_province_code?: string | null
        }
        Update: {
          city_id?: string
          country?: string | null
          country_code?: string | null
          destination?: string
          id?: number
          priority?: number
          state_province?: string | null
          state_province_code?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      viator_activity_bookings: {
        Row: {
          amount_minor: number
          audit: Json
          billing_country: string | null
          billing_postal_code: string | null
          booked_at: string | null
          booking_reference: string | null
          cart_reference: string
          created_at: string
          currency: string
          customer_email: string | null
          customer_phone: string | null
          failure_reason: string | null
          hold_expires_at: string | null
          id: string
          itinerary_reference: string | null
          payment_status: string
          product_code: string
          product_title: string | null
          session_expires_at: string | null
          status: string
          travel_date: string | null
          traveller_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_minor: number
          audit?: Json
          billing_country?: string | null
          billing_postal_code?: string | null
          booked_at?: string | null
          booking_reference?: string | null
          cart_reference: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          failure_reason?: string | null
          hold_expires_at?: string | null
          id?: string
          itinerary_reference?: string | null
          payment_status?: string
          product_code: string
          product_title?: string | null
          session_expires_at?: string | null
          status?: string
          travel_date?: string | null
          traveller_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_minor?: number
          audit?: Json
          billing_country?: string | null
          billing_postal_code?: string | null
          booked_at?: string | null
          booking_reference?: string | null
          cart_reference?: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          failure_reason?: string | null
          hold_expires_at?: string | null
          id?: string
          itinerary_reference?: string | null
          payment_status?: string
          product_code?: string
          product_title?: string | null
          session_expires_at?: string | null
          status?: string
          travel_date?: string | null
          traveller_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      owns_booking: {
        Args: { _booking_id: string; _user_id: string }
        Returns: boolean
      }
      staff_update_booking: {
        Args: {
          _amount_paid?: number
          _assigned_to?: string
          _balance_due?: number
          _booking_id: string
          _cancellation_reason?: string
          _sla_due_at?: string
          _status?: string
          _supplier_reference?: string
          _supplier_status?: string
        }
        Returns: {
          amount: number | null
          amount_paid: number
          assigned_to: string | null
          balance_due: number
          cancellation_reason: string | null
          created_at: string
          currency: string
          deposit_amount: number | null
          details: Json
          id: string
          idempotency_key: string | null
          product_type: string
          reference: string
          sla_due_at: string | null
          status: string
          supplier: string | null
          supplier_reference: string | null
          supplier_status: string
          title: string
          travel_date: string | null
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "agent" | "b2b" | "b2c"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "agent", "b2b", "b2c"],
    },
  },
} as const
