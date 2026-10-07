-- Apply AFTER schema.sql, once. Existing code-based student records remain intact.
begin;
create table ttobak_private.student_accounts(
 login_name text primary key check(char_length(login_name) between 1 and 50),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 student_id uuid not null unique references public.writing_students(id), created_at timestamptz not null default now()
);
create table ttobak_private.auth_limits(key text primary key, window_start timestamptz not null, attempts integer not null);
create function public.writing_auth_limit(limit_key text,max_attempts integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare count integer;
begin
 insert into ttobak_private.auth_limits(key,window_start,attempts) values(limit_key,now(),1)
 on conflict(key) do update set
 attempts=case when ttobak_private.auth_limits.window_start<now()-interval '10 minutes' then 1 else ttobak_private.auth_limits.attempts+1 end,
 window_start=case when ttobak_private.auth_limits.window_start<now()-interval '10 minutes' then now() else ttobak_private.auth_limits.window_start end
 returning attempts into count;
 return count<=max_attempts;
end $$;
create function public.writing_register_named_student(account_id uuid,login_name text,student_name text,class_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare class_key uuid;student_key uuid;next_number integer;
begin
 if login_name is null or char_length(login_name) not between 1 and 50 then raise exception '이름을 확인해 주세요.'; end if;
 select id into class_key from public.writing_classes where code=class_code for update;
 if not found then raise exception '학급 코드를 확인해 주세요.'; end if;
 if exists(select 1 from ttobak_private.student_accounts a where a.login_name=writing_register_named_student.login_name) then raise exception '이미 사용 중인 이름입니다. 이름 뒤에 반이나 번호를 붙여 주세요.'; end if;
 select coalesce(max(number),0)+1 into next_number from public.writing_students where class_id=class_key;
 if next_number>999 then raise exception '학급 학생 수 제한에 도달했습니다.'; end if;
 insert into public.writing_students(class_id,name,number) values(class_key,trim(student_name),next_number) returning id into student_key;
 insert into ttobak_private.student_accounts(login_name,user_id,student_id) values(login_name,account_id,student_key);
 insert into public.writing_memberships(user_id,student_id) values(account_id,student_key);
 return student_key;
end $$;
create function public.writing_find_student_account(account_name text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',u.email,'active',s.active,'student_id',s.id)
 from ttobak_private.student_accounts a join auth.users u on u.id=a.user_id join public.writing_students s on s.id=a.student_id
 where a.login_name=account_name
$$;
create or replace function public.writing_is_student(student_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_students s where s.id=student_key and s.active and
 (exists(select 1 from public.writing_memberships m where m.user_id=auth.uid() and m.student_id=s.id)
 or exists(select 1 from ttobak_private.student_accounts a where a.user_id=auth.uid() and a.student_id=s.id)))
$$;
create or replace function public.writing_student_in_class(class_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_students s where s.class_id=class_key and public.writing_is_student(s.id))
$$;
create function public.writing_my_student() returns uuid language sql stable security definer set search_path='' as $$
 select s.id from public.writing_students s where public.writing_is_student(s.id) limit 1
$$;
create function public.writing_set_student_active(student_key uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.writing_owns_student(student_key) then raise exception '교사 권한이 필요합니다.'; end if;
 update public.writing_students set active=enabled where id=student_key;
 if not enabled then delete from public.writing_memberships where student_id=student_key; end if;
end $$;
create function public.writing_student_logins(class_key uuid) returns table(student_id uuid,login_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.writing_owns_class(class_key) then raise exception '교사 권한이 필요합니다.'; end if;
 return query select a.student_id,a.login_name from ttobak_private.student_accounts a join public.writing_students s on s.id=a.student_id where s.class_id=class_key;
end $$;
revoke all on function public.writing_auth_limit(text,integer),public.writing_register_named_student(uuid,text,text,text),public.writing_find_student_account(text) from public,anon,authenticated;
grant execute on function public.writing_auth_limit(text,integer),public.writing_register_named_student(uuid,text,text,text),public.writing_find_student_account(text) to service_role;
revoke all on function public.writing_my_student(),public.writing_set_student_active(uuid,boolean),public.writing_student_logins(uuid) from public,anon;
grant execute on function public.writing_my_student(),public.writing_set_student_active(uuid,boolean),public.writing_student_logins(uuid) to authenticated;
commit;
