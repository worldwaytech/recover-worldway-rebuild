REVOKE EXECUTE ON FUNCTION public.enforce_booking_event_actor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_message_author() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_document_owner() FROM PUBLIC, anon, authenticated;