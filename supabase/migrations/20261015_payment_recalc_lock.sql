-- 로컬 동시성 검증 후 2026-10-15 운영 적용. 권한 및 기존 거래 데이터 변경 없음.
CREATE OR REPLACE FUNCTION public.recalc_payment_record()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_id bigint; new_id bigint; target_id bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_id := OLD.payment_record_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_id := NEW.payment_record_id; END IF;
  PERFORM id FROM public.payment_records WHERE id IN (old_id,new_id) ORDER BY id FOR NO KEY UPDATE;
  FOR target_id IN SELECT DISTINCT id FROM public.payment_records WHERE id IN (old_id,new_id) ORDER BY id LOOP
    UPDATE public.payment_records SET paid_amount = COALESCE((
      SELECT SUM(CASE WHEN type='expense' THEN -amount ELSE amount END)
      FROM public.payment_history WHERE payment_record_id=target_id
    ),0), updated_at=NOW() WHERE id=target_id;
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END;
$$;
