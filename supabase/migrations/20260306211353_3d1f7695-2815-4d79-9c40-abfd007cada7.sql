CREATE POLICY "Anyone can delete items"
ON public.itinerary_items
FOR DELETE
USING (true);