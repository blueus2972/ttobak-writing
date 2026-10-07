-- Run once in the Supabase SQL Editor for a NEW project.
begin;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists ttobak_private;
revoke all on schema ttobak_private from public, anon, authenticated;
create table ttobak_private.teacher_allowlist(email text primary key);
create table public.writing_classes (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id),
 name text not null check(char_length(name) between 1 and 80),
 code text not null unique default encode(extensions.gen_random_bytes(6),'hex'), created_at timestamptz not null default now()
);
create table public.writing_students (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.writing_classes(id),
 name text not null check(char_length(name) between 1 and 50), number integer not null check(number between 1 and 999),
 active boolean not null default true, created_at timestamptz not null default now(), unique(class_id,number)
);
create table ttobak_private.student_codes (
 student_id uuid primary key references public.writing_students(id), code_hash text not null unique
);
create table public.writing_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 student_id uuid not null references public.writing_students(id), created_at timestamptz not null default now()
);
create table public.writing_submissions (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.writing_students(id),
 title text not null check(char_length(title) between 1 and 100), paths text[] not null check(cardinality(paths) between 1 and 20),
 feedback text not null default '' check(char_length(feedback)<=3000), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index on public.writing_students(class_id);
create index on public.writing_memberships(student_id);
create index on public.writing_submissions(student_id,created_at desc);
create function public.writing_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from ttobak_private.teacher_allowlist where email=lower(auth.jwt()->>'email'))
$$;
create function public.writing_owns_class(class_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.writing_is_teacher() and exists(select 1 from public.writing_classes where id=class_key and teacher_id=auth.uid())
$$;
create function public.writing_owns_student(student_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_students where id=student_key and public.writing_owns_class(class_id))
$$;
create function public.writing_is_student(student_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_memberships m join public.writing_students s on s.id=m.student_id
 where m.user_id=auth.uid() and s.id=student_key and s.active)
$$;
create function public.writing_student_in_class(class_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_memberships m join public.writing_students s on s.id=m.student_id
 where m.user_id=auth.uid() and s.class_id=class_key and s.active)
$$;
alter table public.writing_classes enable row level security;
alter table public.writing_students enable row level security;
alter table public.writing_memberships enable row level security;
alter table public.writing_submissions enable row level security;
revoke all on public.writing_classes,public.writing_students,public.writing_memberships,public.writing_submissions from anon,authenticated;
grant select,insert on public.writing_classes to authenticated;
grant select on public.writing_students,public.writing_memberships,public.writing_submissions to authenticated;
grant update(name,number) on public.writing_students to authenticated;
grant update(feedback,reviewed_at) on public.writing_submissions to authenticated;
create policy writing_classes_read on public.writing_classes for select to authenticated using((teacher_id=auth.uid() and public.writing_is_teacher()) or public.writing_student_in_class(id));
create policy writing_classes_create on public.writing_classes for insert to authenticated with check(public.writing_is_teacher() and teacher_id=auth.uid());
create policy writing_students_read on public.writing_students for select to authenticated using(public.writing_owns_student(id) or public.writing_is_student(id));
create policy writing_students_edit on public.writing_students for update to authenticated using(public.writing_owns_student(id)) with check(public.writing_owns_student(id));
create policy writing_memberships_read on public.writing_memberships for select to authenticated using(user_id=auth.uid() and public.writing_is_student(student_id));
create policy writing_submissions_read on public.writing_submissions for select to authenticated using(public.writing_owns_student(student_id) or public.writing_is_student(student_id));
create policy writing_submissions_review on public.writing_submissions for update to authenticated using(public.writing_owns_student(student_id)) with check(public.writing_owns_student(student_id));
create function public.writing_add_student(class_key uuid,student_name text,student_number integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student_key uuid; token text;
begin
 if not public.writing_owns_class(class_key) then raise exception '교사 권한이 필요합니다.'; end if;
 token:=encode(extensions.gen_random_bytes(16),'hex');
 insert into public.writing_students(class_id,name,number) values(class_key,trim(student_name),student_number) returning id into student_key;
 insert into ttobak_private.student_codes values(student_key,encode(extensions.digest(token,'sha256'),'hex'));
 return jsonb_build_object('id',student_key,'code',token);
end $$;
create function public.writing_reset_student(student_key uuid,disable boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if not public.writing_owns_student(student_key) then raise exception '교사 권한이 필요합니다.'; end if;
 token:=encode(extensions.gen_random_bytes(16),'hex');
 update public.writing_students set active=not disable where id=student_key;
 update ttobak_private.student_codes set code_hash=encode(extensions.digest(token,'sha256'),'hex') where student_id=student_key;
 delete from public.writing_memberships where student_id=student_key;
 return case when disable then null else token end;
end $$;
create function public.writing_join(class_code text,student_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare student_row record;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false then raise exception '학생 입장 세션이 필요합니다.'; end if;
 if char_length(student_code)<>32 or char_length(class_code)<>12 then raise exception '입장 코드를 확인해 주세요.'; end if;
 select s.id,s.class_id,s.name,s.number,c.name as class_name into student_row
 from public.writing_students s join public.writing_classes c on c.id=s.class_id
 join ttobak_private.student_codes k on k.student_id=s.id
 where c.code=lower(trim(class_code)) and s.active and k.code_hash=encode(extensions.digest(lower(trim(student_code)),'sha256'),'hex');
 if not found then raise exception '입장 코드를 확인해 주세요.'; end if;
 insert into public.writing_memberships(user_id,student_id) values(auth.uid(),student_row.id)
 on conflict(user_id) do update set student_id=excluded.student_id,created_at=now();
 return to_jsonb(student_row);
end $$;
create function public.writing_submit(student_key uuid,submission_title text,image_paths text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare class_key uuid; item text; result uuid;
begin
 if not public.writing_is_student(student_key) then raise exception '학생 입장 코드로 다시 들어와 주세요.'; end if;
 if image_paths is null or cardinality(image_paths) not between 1 and 20 then raise exception '1~20개의 이미지를 제출해 주세요.'; end if;
 select class_id into class_key from public.writing_students where id=student_key;
 foreach item in array image_paths loop
 if item is null or not starts_with(item,class_key::text||'/'||student_key::text||'/'||auth.uid()::text||'/')
 or not exists(select 1 from storage.objects where bucket_id='writing-submissions' and name=item and owner_id=auth.uid()::text)
 or exists(select 1 from public.writing_submissions where item=any(paths))
 then raise exception '업로드된 이미지의 권한을 확인할 수 없습니다.'; end if;
 end loop;
 insert into public.writing_submissions(student_id,title,paths) values(student_key,trim(submission_title),image_paths) returning id into result;
 return result;
end $$;
-- UUID folders are compared as text to avoid malformed input casts.
create function public.writing_storage_access(object_name text,for_upload boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.writing_students s where s.id::text=split_part(object_name,'/',2)
 and s.class_id::text=split_part(object_name,'/',1)
 and case when for_upload then public.writing_is_student(s.id) and split_part(object_name,'/',3)=auth.uid()::text
 else public.writing_owns_student(s.id) or public.writing_is_student(s.id) end)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('writing-submissions','writing-submissions',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy writing_images_upload on storage.objects for insert to authenticated
with check(bucket_id='writing-submissions' and public.writing_storage_access(name,true));
create policy writing_images_read on storage.objects for select to authenticated
using(bucket_id='writing-submissions' and public.writing_storage_access(name,false));
create policy writing_images_cleanup on storage.objects for delete to authenticated
using(bucket_id='writing-submissions' and owner_id=auth.uid()::text and public.writing_storage_access(name,true)
 and not exists(select 1 from public.writing_submissions where name=any(paths)));
-- Postgres grants function execution to PUBLIC by default; restrict all app RPCs.
revoke all on function public.writing_is_teacher(),public.writing_owns_class(uuid),public.writing_owns_student(uuid),public.writing_is_student(uuid),public.writing_student_in_class(uuid),public.writing_add_student(uuid,text,integer),public.writing_reset_student(uuid,boolean),public.writing_join(text,text),public.writing_submit(uuid,text,text[]),public.writing_storage_access(text,boolean) from public,anon;
grant execute on function public.writing_is_teacher(),public.writing_owns_class(uuid),public.writing_owns_student(uuid),public.writing_is_student(uuid),public.writing_student_in_class(uuid),public.writing_add_student(uuid,text,integer),public.writing_reset_student(uuid,boolean),public.writing_join(text,text),public.writing_submit(uuid,text,text[]),public.writing_storage_access(text,boolean) to authenticated;
commit;
-- After migration, authorize the teacher in the SQL Editor:
-- insert into ttobak_private.teacher_allowlist(email) values(lower('YOUR_TEACHER_EMAIL')) on conflict do nothing;

