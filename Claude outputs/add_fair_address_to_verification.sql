-- 1. Add the missing column to store the address on a pending request
ALTER TABLE public.fair_verification ADD COLUMN IF NOT EXISTS fair_address text;

-- 2. Update the function to accept and store it
CREATE OR REPLACE FUNCTION public.submit_fair_verification_request(p_user_id uuid, p_fair_name text, p_fair_city text, p_fair_state text, p_fair_website text DEFAULT NULL::text, p_fair_role text DEFAULT NULL::text, p_role_details text DEFAULT NULL::text, p_fair_notes text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_extra_email text DEFAULT NULL::text, p_fair_id integer DEFAULT NULL::integer, p_authorization_confirmed boolean DEFAULT false, p_terms_version text DEFAULT NULL::text, p_terms_agreed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_terms_confirmed boolean DEFAULT false, p_fair_address text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_submissions_today int;
  v_total_pending int;
  v_last_submission timestamptz;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Count submissions in last 24 hours
  SELECT COUNT(*) INTO v_submissions_today
  FROM public.fair_verification
  WHERE user_id = p_user_id
    AND submitted_at >= now() - INTERVAL '24 hours';

  -- Max 5 per day
  IF v_submissions_today >= 5 THEN
    RAISE EXCEPTION 'daily_limit_reached';
  END IF;

  -- Count total pending (not approved, not rejected, not reset by user)
  SELECT COUNT(*) INTO v_total_pending
  FROM public.fair_verification
  WHERE user_id = p_user_id
    AND (approved IS NULL OR approved = false)
    AND (rejected IS NULL OR rejected = false)
    AND (user_reset IS NULL OR user_reset = false);

  -- Max 7 total pending
  IF v_total_pending >= 7 THEN
    RAISE EXCEPTION 'pending_limit_reached';
  END IF;

  -- Cooldown: if they have 3+ submissions today and last one was within 10 minutes, slow them down
  SELECT MAX(submitted_at) INTO v_last_submission
  FROM public.fair_verification
  WHERE user_id = p_user_id;

  IF v_last_submission IS NOT NULL
    AND v_last_submission > now() - INTERVAL '10 minutes'
    AND v_submissions_today >= 3 THEN
    RAISE EXCEPTION 'cooldown_active';
  END IF;

  -- All checks passed — insert
  INSERT INTO public.fair_verification (
    user_id,
    fair_name,
    fair_city,
    fair_state,
    fair_address,
    fair_website,
    fair_role,
    role_details,
    fair_notes,
    contact_name,
    contact_phone,
    extra_email,
    fair_id,
    authorization_confirmed,
    terms_version,
    terms_agreed_at,
    terms_confirmed
  ) VALUES (
    p_user_id,
    p_fair_name,
    p_fair_city,
    p_fair_state,
    p_fair_address,
    p_fair_website,
    p_fair_role,
    p_role_details,
    p_fair_notes,
    p_contact_name,
    p_contact_phone,
    p_extra_email,
    p_fair_id,
    p_authorization_confirmed,
    p_terms_version,
    p_terms_agreed_at,
    p_terms_confirmed
  );
END;
$function$;
