begin;
alter table public.writing_students alter column number drop not null;
alter table public.writing_classes add column if not exists practice_text text not null default '' check(char_length(practice_text)<=6000), add column if not exists practice_title text not null default '' check(char_length(practice_title)<=100);
grant update(practice_text,practice_title) on public.writing_classes to authenticated;
create policy writing_classes_edit_practice on public.writing_classes for update to authenticated using(public.writing_owns_class(id)) with check(public.writing_owns_class(id));
create or replace function public.writing_register_named_student(account_id uuid,login_name text,student_name text,class_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare class_key uuid;student_key uuid;
begin
 if login_name is null or char_length(login_name) not between 1 and 50 then raise exception '이름을 확인해 주세요.'; end if;
 select id into class_key from public.writing_classes where code=class_code for update;
 if not found then raise exception '학급 코드를 확인해 주세요.'; end if;
 if exists(select 1 from ttobak_private.student_accounts a where a.login_name=writing_register_named_student.login_name) then raise exception '이미 사용 중인 이름입니다. 이름 뒤에 반이나 번호를 붙여 주세요.'; end if;
 insert into public.writing_students(class_id,name) values(class_key,trim(student_name)) returning id into student_key;
 insert into ttobak_private.student_accounts(login_name,user_id,student_id) values(login_name,account_id,student_key);
 insert into public.writing_memberships(user_id,student_id) values(account_id,student_key);
 return student_key;
end $$;
commit;
