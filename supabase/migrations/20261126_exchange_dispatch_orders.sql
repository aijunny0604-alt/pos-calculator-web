ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS exchange_origin_order_id text,
  ADD COLUMN IF NOT EXISTS exchange_origin_return_id text,
  ADD COLUMN IF NOT EXISTS exchange_delivery_method text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_exchange_origin_return_idx
  ON public.orders (exchange_origin_order_id, exchange_origin_return_id)
  WHERE exchange_origin_order_id IS NOT NULL;

-- Register the outbound order, deduct its stock and record the exchange in one transaction.
CREATE OR REPLACE FUNCTION public.save_return_with_exchange_order(
  p_order_id text, p_action text, p_return_id text, p_expected_items jsonb,
  p_expected_returns jsonb, p_expected_total numeric, p_selections jsonb, p_details jsonb,
  p_request_id text, p_exchange_items jsonb, p_delivery_method text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  source_order public.orders%ROWTYPE;
  exchange_order public.orders%ROWTYPE;
  product public.products%ROWTYPE;
  line jsonb;
  exchange_items jsonb := '[]'::jsonb;
  stock_updates jsonb := '[]'::jsonb;
  result jsonb;
  line_quantity int;
  unit_price numeric;
  base_price numeric;
  taxable_total numeric := 0;
  tax_free_total numeric := 0;
  supply numeric;
  replacement_summary text;
  is_tax_free boolean;
  created_id text;
  id_suffix text;
  now_at timestamptz := statement_timestamp();
BEGIN
  IF coalesce(p_action, '') NOT IN ('add','edit') OR coalesce(p_details->>'kind', '') <> 'exchange'
      OR coalesce(p_request_id, '') !~ '^RET-[A-Za-z0-9-]{1,96}$'
      OR coalesce(p_return_id, '') !~ '^RET-[A-Za-z0-9-]{1,96}$'
      OR coalesce(p_delivery_method, '') NOT IN ('courier','pickup') THEN
    RAISE EXCEPTION 'invalid_exchange_order';
  END IF;
  IF jsonb_typeof(p_exchange_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_exchange_items'; END IF;
  IF jsonb_array_length(p_exchange_items) NOT BETWEEN 1 AND 100 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exchange_items) AS selected(value)
    WHERE coalesce(value->>'id','') !~ '^[1-9][0-9]{0,14}$'
      OR coalesce(value->>'quantity','') !~ '^[1-9][0-9]{0,3}$'
      OR coalesce(value->>'basePrice','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
      OR coalesce(value->>'price','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
  ) OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_exchange_items)) <> jsonb_array_length(p_exchange_items) THEN
    RAISE EXCEPTION 'invalid_exchange_items';
  END IF;

  SELECT * INTO source_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR nullif(btrim(source_order.customer_name), '') IS NULL THEN RAISE EXCEPTION 'exchange_source_missing'; END IF;
  id_suffix := substr(md5(p_order_id || ':' || p_request_id), 1, 12);
  SELECT * INTO exchange_order FROM public.orders WHERE exchange_origin_order_id = p_order_id AND exchange_origin_return_id = p_return_id;
  IF FOUND THEN
    IF right(exchange_order.id, 12) <> id_suffix OR exchange_order.exchange_delivery_method IS DISTINCT FROM p_delivery_method
        OR jsonb_array_length(exchange_order.items) <> jsonb_array_length(p_exchange_items)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_exchange_items) AS requested(value)
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(exchange_order.items) AS saved(value)
            WHERE saved.value->>'id' = requested.value->>'id' AND saved.value->>'quantity' = requested.value->>'quantity'
              AND (saved.value->>'price')::numeric = (requested.value->>'price')::numeric
          )
        ) OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(coalesce(source_order.returns,'[]'::jsonb)) AS entry(value)
          WHERE value->>'returnId' = p_return_id AND value->'returnDetails'->>'exchangeOrderNumber' = exchange_order.id
            AND value->'returnDetails'->>'reason' = p_details->>'reason'
            AND coalesce(value->'returnDetails'->>'note','') = btrim(coalesce(p_details->>'note',''))
            AND (nullif(btrim(p_details->>'replacement'),'') IS NULL OR value->'returnDetails'->>'replacement' = btrim(p_details->>'replacement'))
        ) THEN RAISE EXCEPTION 'exchange_already_created'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'stock', p.stock)), '[]'::jsonb)
      INTO stock_updates FROM public.products p
      WHERE p.stock IS NOT NULL AND p.id IN (SELECT (value->>'id')::bigint FROM jsonb_array_elements(p_exchange_items));
    RETURN jsonb_build_object('returns', source_order.returns, 'total_returned', source_order.total_returned,
      'exchange_order', to_jsonb(exchange_order), 'stock_updates', stock_updates, 'reused', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(source_order.returns, '[]'::jsonb)) AS entry(value)
    WHERE value->>'returnId' = p_return_id AND nullif(value->'returnDetails'->>'exchangeOrderNumber','') IS NOT NULL
  ) THEN RAISE EXCEPTION 'exchange_already_created'; END IF;

  created_id := 'ORD-' || to_char(now_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD') || '-' || id_suffix;
  -- Lock products in ID order so concurrent outbound orders use the latest remaining units.
  FOR line IN SELECT value FROM jsonb_array_elements(p_exchange_items) ORDER BY (value->>'id')::bigint LOOP
    SELECT * INTO product FROM public.products WHERE id = (line->>'id')::bigint FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'exchange_product_missing'; END IF;
    line_quantity := (line->>'quantity')::int;
    base_price := CASE WHEN source_order.price_type = 'retail'
                       THEN coalesce(nullif(product.retail, 0), product.wholesale, 0)
                       ELSE coalesce(product.wholesale, 0) END;
    unit_price := (line->>'price')::numeric;
    IF base_price <> (line->>'basePrice')::numeric OR unit_price > base_price
        OR coalesce(nullif(to_jsonb(product)->'discount_tiers','null'::jsonb),'[]'::jsonb) IS DISTINCT FROM line->'catalogTiers' THEN
      RAISE EXCEPTION 'exchange_price_changed';
    END IF;
    IF product.stock IS NOT NULL THEN
      IF product.stock < line_quantity THEN RAISE EXCEPTION 'exchange_stock_unavailable'; END IF;
      UPDATE public.products SET stock = stock - line_quantity WHERE id = product.id RETURNING stock INTO product.stock;
      IF NOT FOUND THEN RAISE EXCEPTION 'exchange_stock_unavailable'; END IF;
      stock_updates := stock_updates || jsonb_build_array(jsonb_build_object('id', product.id, 'stock', product.stock));
    END IF;
    is_tax_free := coalesce(to_jsonb(product)->>'tax_free', to_jsonb(product)->>'taxFree', 'false') = 'true';
    IF is_tax_free THEN tax_free_total := tax_free_total + unit_price * line_quantity;
    ELSE taxable_total := taxable_total + unit_price * line_quantity; END IF;
    exchange_items := exchange_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', product.id, 'name', product.name, 'price', unit_price, 'quantity', line_quantity,
      'taxFree', is_tax_free, 'category', to_jsonb(product)->>'category',
      'originalPrice', CASE WHEN unit_price < base_price THEN base_price END,
      'discountType', CASE WHEN unit_price < base_price THEN 'amount' END,
      'discountValue', CASE WHEN unit_price < base_price THEN base_price - unit_price END,
      'originalPriceField', CASE WHEN unit_price < base_price THEN CASE WHEN source_order.price_type = 'retail' THEN 'retail' ELSE 'wholesale' END END
    )));
  END LOOP;

  supply := round(taxable_total / 1.1);
  INSERT INTO public.orders (
    id, customer_name, customer_phone, customer_address, price_type, items, total, subtotal, vat, memo, created_at,
    exchange_origin_order_id, exchange_origin_return_id, exchange_delivery_method
  ) VALUES (
    created_id, source_order.customer_name, source_order.customer_phone, source_order.customer_address,
    CASE WHEN source_order.price_type = 'retail' THEN 'retail' ELSE 'wholesale' END, exchange_items,
    taxable_total + tax_free_total, supply + tax_free_total, taxable_total - supply,
    '반품 교체 · 원주문 ' || p_order_id, now_at,
    p_order_id, p_return_id, p_delivery_method
  ) RETURNING * INTO exchange_order;
  SELECT left(string_agg(value->>'name' || ' ×' || (value->>'quantity'), ', '), 300)
    INTO replacement_summary FROM jsonb_array_elements(exchange_items);
  result := public.save_order_return(p_order_id, p_action, p_return_id, p_expected_items, p_expected_returns,
    p_expected_total, p_selections, p_details || jsonb_build_object(
      'exchangeOrderNumber', created_id, 'replacement', coalesce(nullif(btrim(p_details->>'replacement'), ''), replacement_summary)
    ));
  RETURN result || jsonb_build_object('exchange_order', to_jsonb(exchange_order), 'stock_updates', stock_updates, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_return_with_exchange_order(text,text,text,jsonb,jsonb,numeric,jsonb,jsonb,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_return_with_exchange_order(text,text,text,jsonb,jsonb,numeric,jsonb,jsonb,text,jsonb,text) TO anon, authenticated, service_role;
