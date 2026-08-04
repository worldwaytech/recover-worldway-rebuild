DROP POLICY "Anyone can submit a contact message" ON public.contact_messages;
CREATE POLICY "Anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY "Anyone may request a quote" ON public.quote_requests;
CREATE POLICY "Anyone may request a quote"
ON public.quote_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());