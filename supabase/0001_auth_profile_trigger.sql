-- Crea automaticamente el perfil PROUNI al registrar un usuario en Supabase Auth.
-- Ejecutar una vez en Supabase > SQL Editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombres, apellidos, email, rol, activo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombres', ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'apellidos', ''),
    new.email,
    'mentee',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Reparar usuarios creados antes de instalar el trigger.
insert into public.profiles (id, nombres, apellidos, email, rol, activo)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'nombres', ''), split_part(coalesce(u.email, ''), '@', 1)),
  nullif(u.raw_user_meta_data ->> 'apellidos', ''),
  u.email,
  'mentee',
  true
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
