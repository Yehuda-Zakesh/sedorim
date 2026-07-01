
-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ seder entries ============
CREATE TABLE public.seder_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  seder SMALLINT NOT NULL CHECK (seder IN (1,2)),
  arrival TEXT,
  departure TEXT,
  absent BOOLEAN NOT NULL DEFAULT false,
  ohevei BOOLEAN NOT NULL DEFAULT false,
  excused_all BOOLEAN NOT NULL DEFAULT false,
  excused_minutes INTEGER NOT NULL DEFAULT 0,
  manual_adjust_min INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, seder)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seder_entries TO authenticated;
GRANT ALL ON public.seder_entries TO service_role;
ALTER TABLE public.seder_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own seder entries" ON public.seder_entries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_seder_upd BEFORE UPDATE ON public.seder_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_seder_user_date ON public.seder_entries(user_id, date);

-- ============ learning entries ============
CREATE TABLE public.learning_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  framework TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  topic TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_entries TO authenticated;
GRANT ALL ON public.learning_entries TO service_role;
ALTER TABLE public.learning_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learning entries" ON public.learning_entries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_learning_upd BEFORE UPDATE ON public.learning_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_learning_user_date ON public.learning_entries(user_id, date);

-- ============ per-user settings (single row) ============
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_settings_upd BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ realtime for cross-app sync ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.seder_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;
