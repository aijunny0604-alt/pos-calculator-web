-- Save the order's return history and the customer return journal in one transaction.
CREATE OR REPLACE FUNCTION public.save_order_return(
  p_order_id text, p_action text, p_return_id text, p_expected_items jsonb,
  p_expected_returns jsonb, p_expected_total numeric, p_selections jsonb, p_details jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  source_order public.orders%ROWTYPE;
  old_returns jsonb;
  changed_returns jsonb;
  group_rows jsonb;
  next_total numeric;
  group_total numeric;
  now_at timestamptz := statement_timestamp();
  selected jsonb;
  item jsonb;
  item_index int;
  quantity int;
  unit_price numeric;
  exchange_order text;
  journal_id bigint;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('add', 'edit', 'remove')
      OR p_return_id IS NULL OR p_return_id !~ '^RET-[A-Za-z0-9-]{1,96}$' THEN
    RAISE EXCEPTION 'invalid_return_action';
  END IF;

  SELECT * INTO source_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'return_order_missing'; END IF;
  old_returns := coalesce(source_order.returns, '[]'::jsonb);
  next_total := coalesce(source_order.total_returned, 0);
  IF old_returns IS DISTINCT FROM p_expected_returns
      OR next_total IS DISTINCT FROM p_expected_total
      OR (p_action = 'add' AND coalesce(source_order.items, '[]'::jsonb) IS DISTINCT FROM p_expected_items) THEN
    RAISE EXCEPTION 'return_order_changed';
  END IF;

  SELECT coalesce(jsonb_agg(value ORDER BY position), '[]'::jsonb),
    coalesce(sum(coalesce((value->>'total')::numeric, (value->>'price')::numeric * coalesce((value->>'quantity')::numeric, (value->>'returnQuantity')::numeric))), 0)
    INTO group_rows, group_total
    FROM jsonb_array_elements(old_returns) WITH ORDINALITY AS history(value, position)
    WHERE value->>'returnId' = p_return_id;

  IF p_action <> 'remove' THEN
    IF coalesce(p_details->>'kind', '') NOT IN ('return', 'exchange')
        OR coalesce(p_details->>'reason', '') NOT IN ('오배송', '제품 불량', '주문 착오', '고객 요청', '기타')
        OR length(coalesce(p_details->>'note', '')) > 500
        OR length(coalesce(p_details->>'replacement', '')) > 300
        OR length(coalesce(p_details->>'exchangeOrderNumber', '')) > 100
        OR (p_details->>'reason' = '기타' AND btrim(coalesce(p_details->>'note', '')) = '') THEN
      RAISE EXCEPTION 'invalid_return_details';
    END IF;
    exchange_order := nullif(btrim(p_details->>'exchangeOrderNumber'), '');
    IF p_details->>'kind' = 'exchange' THEN
      IF exchange_order IS NULL AND btrim(coalesce(p_details->>'replacement', '')) = '' THEN
        RAISE EXCEPTION 'return_exchange_details_required';
      END IF;
      IF exchange_order IS NOT NULL
          AND exchange_order IS DISTINCT FROM group_rows->0->'returnDetails'->>'exchangeOrderNumber'
          AND NOT EXISTS (
            SELECT 1 FROM public.orders replacement
            WHERE replacement.id = exchange_order AND replacement.id <> source_order.id
              AND btrim(source_order.customer_name) <> ''
              AND regexp_replace(lower(replacement.customer_name), '\s+', '', 'g') =
                  regexp_replace(lower(source_order.customer_name), '\s+', '', 'g')
          ) THEN RAISE EXCEPTION 'return_exchange_order_invalid'; END IF;
    ELSE
      exchange_order := NULL;
    END IF;
    p_details := jsonb_build_object(
      'kind', p_details->>'kind', 'reason', p_details->>'reason', 'note', btrim(coalesce(p_details->>'note', '')),
      'exchangeOrderNumber', coalesce(exchange_order, ''),
      'replacement', CASE WHEN p_details->>'kind' = 'exchange' THEN btrim(coalesce(p_details->>'replacement', '')) ELSE '' END
    );
  END IF;

  IF p_action = 'add' THEN
    IF group_rows <> '[]'::jsonb OR jsonb_typeof(p_selections) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_return_selection';
    END IF;
    IF jsonb_array_length(p_selections) = 0 OR
        (SELECT count(DISTINCT value->>'index') FROM jsonb_array_elements(p_selections)) <> jsonb_array_length(p_selections) THEN
      RAISE EXCEPTION 'invalid_return_selection';
    END IF;
    FOR selected IN SELECT value FROM jsonb_array_elements(p_selections) LOOP
      IF coalesce(selected->>'index', '') !~ '^(0|[1-9]\d{0,5})$' OR coalesce(selected->>'quantity', '') !~ '^[1-9]\d{0,8}$' THEN
        RAISE EXCEPTION 'invalid_return_selection';
      END IF;
      item_index := (selected->>'index')::int;
      quantity := (selected->>'quantity')::int;
      item := source_order.items->item_index;
      unit_price := coalesce((item->>'price')::numeric, (item->>'wholesale')::numeric, 0);
      IF item IS NULL OR quantity > coalesce((item->>'quantity')::numeric, 0) OR unit_price < 0 THEN
        RAISE EXCEPTION 'invalid_return_quantity';
      END IF;
      group_rows := group_rows || jsonb_build_array(jsonb_build_object(
        'returnId', p_return_id, 'itemId', item->'id', 'itemName', item->>'name',
        'price', unit_price, 'quantity', quantity, 'total', unit_price * quantity,
        'returnedAt', now_at, 'returnDetails', p_details
      ));
      group_total := group_total + unit_price * quantity;
    END LOOP;
    changed_returns := old_returns || group_rows;
    -- 여러 가격으로 같은 상품을 담은 주문도 전체 주문 수량까지만 반품할 수 있다.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(group_rows) AS selected_row(line)
      WHERE (
        SELECT sum(coalesce((history.line->>'quantity')::numeric, (history.line->>'returnQuantity')::numeric, 0))
          FROM jsonb_array_elements(changed_returns) AS history(line)
          WHERE (CASE WHEN nullif(selected_row.line->>'itemId', '') IS NOT NULL
            THEN history.line->>'itemId' = selected_row.line->>'itemId'
            ELSE nullif(history.line->>'itemId', '') IS NULL AND coalesce(history.line->>'itemName', history.line->>'name') = selected_row.line->>'itemName' END)
      ) > (
        SELECT sum((ordered.line->>'quantity')::numeric) FROM jsonb_array_elements(source_order.items) AS ordered(line)
          WHERE (CASE WHEN nullif(selected_row.line->>'itemId', '') IS NOT NULL
            THEN ordered.line->>'id' = selected_row.line->>'itemId'
            ELSE nullif(ordered.line->>'id', '') IS NULL AND ordered.line->>'name' = selected_row.line->>'itemName' END)
      )
    ) THEN RAISE EXCEPTION 'invalid_return_quantity'; END IF;
    next_total := next_total + group_total;
    IF next_total > coalesce(source_order.total, 0) THEN RAISE EXCEPTION 'return_amount_exceeded'; END IF;
  ELSE
    IF group_rows = '[]'::jsonb THEN RAISE EXCEPTION 'return_entry_missing'; END IF;
    IF p_action = 'edit' THEN
      SELECT jsonb_agg(CASE WHEN value->>'returnId' = p_return_id THEN value || jsonb_build_object('returnDetails', p_details) ELSE value END ORDER BY position)
        INTO changed_returns FROM jsonb_array_elements(old_returns) WITH ORDINALITY AS history(value, position);
      SELECT jsonb_agg(value ORDER BY position) INTO group_rows
        FROM jsonb_array_elements(changed_returns) WITH ORDINALITY AS history(value, position)
        WHERE value->>'returnId' = p_return_id;
    ELSE
      SELECT coalesce(jsonb_agg(value ORDER BY position), '[]'::jsonb) INTO changed_returns
        FROM jsonb_array_elements(old_returns) WITH ORDINALITY AS history(value, position)
        WHERE value->>'returnId' IS DISTINCT FROM p_return_id;
      next_total := greatest(0, next_total - group_total);
    END IF;
  END IF;

  IF p_action = 'edit' THEN
    UPDATE public.orders SET returns = changed_returns WHERE id = p_order_id;
  ELSE
    UPDATE public.orders SET returns = changed_returns, total_returned = next_total WHERE id = p_order_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'return_write_denied'; END IF;

  IF p_action = 'remove' THEN
    DELETE FROM public.customer_returns WHERE order_number = p_order_id AND return_id = p_return_id;
    IF EXISTS (SELECT 1 FROM public.customer_returns WHERE order_number = p_order_id AND return_id = p_return_id) THEN
      RAISE EXCEPTION 'return_journal_write_denied';
    END IF;
  ELSIF nullif(btrim(source_order.customer_name), '') IS NOT NULL THEN
    SELECT id INTO journal_id FROM public.customer_returns
      WHERE order_number = p_order_id AND return_id = p_return_id ORDER BY id LIMIT 1;
    IF FOUND THEN
      UPDATE public.customer_returns SET items = group_rows, total_amount = group_total WHERE id = journal_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'return_journal_write_denied'; END IF;
    ELSE
      INSERT INTO public.customer_returns(return_id, customer_name, customer_id, order_number, items, total_amount, returned_at)
        VALUES (p_return_id, source_order.customer_name, to_jsonb(source_order)->>'customer_id', p_order_id, group_rows,
          group_total, coalesce((group_rows->0->>'returnedAt')::timestamptz, now_at));
    END IF;
  END IF;
  RETURN jsonb_build_object('returns', changed_returns, 'total_returned', next_total);
END;
$$;

REVOKE ALL ON FUNCTION public.save_order_return(text, text, text, jsonb, jsonb, numeric, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_order_return(text, text, text, jsonb, jsonb, numeric, jsonb, jsonb) TO anon, authenticated, service_role;
