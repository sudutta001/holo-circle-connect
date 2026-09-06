CREATE OR REPLACE FUNCTION public.messages_only_read_at_editable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read_at can be updated on messages';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_only_read_at_editable
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_only_read_at_editable();