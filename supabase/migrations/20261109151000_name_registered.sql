create function public.name_registered(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where lower(name) = lower(btrim(target))
  );
$$;

revoke all on function public.name_registered(text) from public;
grant execute on function public.name_registered(text) to anon, authenticated, service_role;
