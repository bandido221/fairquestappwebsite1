CREATE OR REPLACE FUNCTION public.update_my_admin_fair(p_user_id uuid, p_fair_id integer, p_name text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_zip text DEFAULT NULL::text, p_website text DEFAULT NULL::text, p_hours text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_week2_start_date date DEFAULT NULL::date, p_week2_end_date date DEFAULT NULL::date, p_week3_start_date date DEFAULT NULL::date, p_week3_end_date date DEFAULT NULL::date, p_week4_start_date date DEFAULT NULL::date, p_week4_end_date date DEFAULT NULL::date, p_week5_start_date date DEFAULT NULL::date, p_week5_end_date date DEFAULT NULL::date, p_week6_start_date date DEFAULT NULL::date, p_week6_end_date date DEFAULT NULL::date, p_week7_start_date date DEFAULT NULL::date, p_week7_end_date date DEFAULT NULL::date, p_week8_start_date date DEFAULT NULL::date, p_week8_end_date date DEFAULT NULL::date, p_week9_start_date date DEFAULT NULL::date, p_week9_end_date date DEFAULT NULL::date, p_week10_start_date date DEFAULT NULL::date, p_week10_end_date date DEFAULT NULL::date, p_image_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1
    from public.fair_admins fa
    where fa.user_id = p_user_id
      and fa.fair_id = p_fair_id
  ) then
    raise exception 'not authorized';
  end if;

  update public.renaissance_fairs
  set
    name = coalesce(p_name, name),
    address = coalesce(p_address, address),
    city = coalesce(p_city, city),
    state = coalesce(p_state, state),
    zip = coalesce(p_zip, zip),
    website = coalesce(p_website, website),
    hours = coalesce(p_hours, hours),
    description = coalesce(p_description, description),
    start_date = coalesce(p_start_date, start_date),
    end_date = coalesce(p_end_date, end_date),
    week2_start_date = coalesce(p_week2_start_date, week2_start_date),
    week2_end_date = coalesce(p_week2_end_date, week2_end_date),
    week3_start_date = coalesce(p_week3_start_date, week3_start_date),
    week3_end_date = coalesce(p_week3_end_date, week3_end_date),
    week4_start_date = coalesce(p_week4_start_date, week4_start_date),
    week4_end_date = coalesce(p_week4_end_date, week4_end_date),
    week5_start_date = coalesce(p_week5_start_date, week5_start_date),
    week5_end_date = coalesce(p_week5_end_date, week5_end_date),
    week6_start_date = coalesce(p_week6_start_date, week6_start_date),
    week6_end_date = coalesce(p_week6_end_date, week6_end_date),
    week7_start_date = coalesce(p_week7_start_date, week7_start_date),
    week7_end_date = coalesce(p_week7_end_date, week7_end_date),
    week8_start_date = coalesce(p_week8_start_date, week8_start_date),
    week8_end_date = coalesce(p_week8_end_date, week8_end_date),
    week9_start_date = coalesce(p_week9_start_date, week9_start_date),
    week9_end_date = coalesce(p_week9_end_date, week9_end_date),
    week10_start_date = coalesce(p_week10_start_date, week10_start_date),
    week10_end_date = coalesce(p_week10_end_date, week10_end_date),
    image_url = coalesce(p_image_url, image_url)
  where id = p_fair_id;
end;
$function$;
