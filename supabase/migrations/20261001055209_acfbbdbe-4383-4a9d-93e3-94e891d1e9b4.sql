CREATE TABLE public.wallet_accounts (
  user_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  reserved_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, currency),
  CHECK (reserved_minor <= balance_minor)
);
GRANT SELECT ON public.wallet_accounts TO authenticated;
GRANT ALL ON public.wallet_accounts TO service_role;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own wallet" ON public.wallet_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff read wallets" ON public.wallet_accounts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER wallet_accounts_updated_at BEFORE UPDATE ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  currency text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('topup','reserve','capture','release','refund','adjustment')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  idempotency_key text NOT NULL UNIQUE,
  booking_id uuid,
  payment_order_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_ledger_user_idx ON public.wallet_ledger (user_id, created_at DESC);
GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff read ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER wallet_ledger_append_only BEFORE UPDATE OR DELETE ON public.wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.prevent_journey_audit_mutation();

CREATE TABLE public.travel_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN ('flight','hotel','bus')),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','supplier_in_progress','confirmed','supplier_failed','supplier_uncertain','cancel_requested','cancelled','refunded','expired')),
  currency text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payment_method text CHECK (payment_method IN ('razorpay','wallet')),
  payment_order_id text UNIQUE,
  payment_id text,
  wallet_reserve_key text UNIQUE,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_booking_id text,
  supplier_pnr text,
  supplier_response jsonb,
  customer_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  paid_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_bookings_user_idx ON public.travel_bookings (user_id, created_at DESC);
GRANT SELECT ON public.travel_bookings TO authenticated;
GRANT ALL ON public.travel_bookings TO service_role;
ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read travel bookings" ON public.travel_bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER travel_bookings_updated_at BEFORE UPDATE ON public.travel_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic wallet operations (service role only).
CREATE OR REPLACE FUNCTION public.wallet_topup(_user uuid, _currency text, _amount bigint, _key text, _order text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  INSERT INTO wallet_ledger (user_id, currency, kind, amount_minor, idempotency_key, payment_order_id, note)
  VALUES (_user, _currency, 'topup', _amount, _key, _order, 'Wallet top-up')
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO wallet_accounts (user_id, currency, balance_minor) VALUES (_user, _currency, _amount)
  ON CONFLICT (user_id, currency) DO UPDATE SET balance_minor = wallet_accounts.balance_minor + EXCLUDED.balance_minor;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_reserve(_user uuid, _currency text, _amount bigint, _key text, _booking uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc wallet_accounts;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = _key) THEN RETURN false; END IF;
  SELECT * INTO acc FROM wallet_accounts WHERE user_id = _user AND currency = _currency FOR UPDATE;
  IF acc IS NULL OR acc.balance_minor - acc.reserved_minor < _amount THEN RETURN false; END IF;
  UPDATE wallet_accounts SET reserved_minor = reserved_minor + _amount WHERE user_id = _user AND currency = _currency;
  INSERT INTO wallet_ledger (user_id, currency, kind, amount_minor, idempotency_key, booking_id, note)
  VALUES (_user, _currency, 'reserve', _amount, _key, _booking, 'Held for booking');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_settle(_reserve_key text, _capture boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r wallet_ledger;
BEGIN
  SELECT * INTO r FROM wallet_ledger WHERE idempotency_key = _reserve_key AND kind = 'reserve';
  IF r IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM wallet_accounts WHERE user_id = r.user_id AND currency = r.currency FOR UPDATE;
  INSERT INTO wallet_ledger (user_id, currency, kind, amount_minor, idempotency_key, booking_id, note)
  VALUES (r.user_id, r.currency, CASE WHEN _capture THEN 'capture' ELSE 'release' END, r.amount_minor,
          _reserve_key || ':settle', r.booking_id, CASE WHEN _capture THEN 'Paid for booking' ELSE 'Hold released' END)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE wallet_accounts SET reserved_minor = reserved_minor - r.amount_minor,
    balance_minor = balance_minor - CASE WHEN _capture THEN r.amount_minor ELSE 0 END
  WHERE user_id = r.user_id AND currency = r.currency;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_refund(_user uuid, _currency text, _amount bigint, _key text, _booking uuid, _note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO wallet_ledger (user_id, currency, kind, amount_minor, idempotency_key, booking_id, note)
  VALUES (_user, _currency, 'refund', _amount, _key, _booking, _note)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO wallet_accounts (user_id, currency, balance_minor) VALUES (_user, _currency, _amount)
  ON CONFLICT (user_id, currency) DO UPDATE SET balance_minor = wallet_accounts.balance_minor + EXCLUDED.balance_minor;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.wallet_topup(uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_reserve(uuid,text,bigint,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_settle(text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_refund(uuid,text,bigint,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_topup(uuid,text,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_reserve(uuid,text,bigint,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_settle(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_refund(uuid,text,bigint,text,uuid,text) TO service_role;