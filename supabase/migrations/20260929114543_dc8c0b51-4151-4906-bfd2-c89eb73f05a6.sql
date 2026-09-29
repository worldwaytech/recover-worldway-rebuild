CREATE TABLE public.travel_dna (
  user_id uuid PRIMARY KEY,
  consent_preferences boolean NOT NULL DEFAULT false,
  consent_history boolean NOT NULL DEFAULT false,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_dna TO authenticated;
GRANT ALL ON public.travel_dna TO service_role;
ALTER TABLE public.travel_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own travel dna select" ON public.travel_dna FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own travel dna insert" ON public.travel_dna FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own travel dna update" ON public.travel_dna FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own travel dna delete" ON public.travel_dna FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER travel_dna_updated_at BEFORE UPDATE ON public.travel_dna FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();