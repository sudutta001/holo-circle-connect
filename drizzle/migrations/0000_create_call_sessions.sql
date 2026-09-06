CREATE TABLE public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  status text NOT NULL DEFAULT 'started'
);

GRANT SELECT, INSERT, UPDATE ON public.call_sessions TO authenticated;
GRANT ALL ON public.call_sessions TO service_role;

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their calls"
ON public.call_sessions FOR SELECT TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Members can log their own calls"
ON public.call_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update their calls"
ON public.call_sessions FOR UPDATE TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = callee_id)
WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE INDEX call_sessions_caller_idx ON public.call_sessions (caller_id, started_at DESC);
CREATE INDEX call_sessions_callee_idx ON public.call_sessions (callee_id, started_at DESC);