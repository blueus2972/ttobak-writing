import { createClient } from '@supabase/supabase-js';
const config=window.WRITING_CONFIG||{};
export const client=config.url&&config.key?createClient(config.url,config.key):null;
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function assertConfigured(){if(!client)throw new Error('Supabase 연결을 준비 중입니다. 교사는 연결 안내를 확인해 주세요.');}
export async function checked(request){const result=await request;if(result.error)throw result.error;return result.data;}
export async function currentStudent(){
 assertConfigured();const {data:{user}}=await client.auth.getUser();if(!user)return null;
 const membership=await checked(client.from('writing_memberships').select('student_id').eq('user_id',user.id).maybeSingle());
 if(!membership)return null;
 const student=await checked(client.from('writing_students').select('*').eq('id',membership.student_id).single());
 const classroom=await checked(client.from('writing_classes').select('id,name,code').eq('id',student.class_id).single());
 return {...student,classroom,userId:user.id};
}
export async function submitImages(student,title,images){
 assertConfigured();if(!title.trim()||title.length>100)throw new Error('제출 제목을 1~100자로 입력해 주세요.');
 if(!images.length||images.length>20)throw new Error('이미지는 1~20장까지 제출할 수 있어요.');
 for(const file of images)if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('이미지 한 장은 10MB 이하의 PNG, JPG, WebP여야 해요.');
 const batch=crypto.randomUUID(),paths=[];let committed=false;
 try{
 for(let i=0;i<images.length;i++){
 const file=images[i],extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
 const path=`${student.class_id}/${student.id}/${student.userId}/${batch}/${i+1}.${extension}`;
 await checked(client.storage.from('writing-submissions').upload(path,file,{contentType:file.type,upsert:false}));paths.push(path);
 }
 const id=await checked(client.rpc('writing_submit',{student_key:student.id,submission_title:title.trim(),image_paths:paths}));committed=true;return id;
 }finally{if(!committed&&paths.length){const cleanup=await client.storage.from('writing-submissions').remove(paths);if(cleanup.error)console.warn('미제출 이미지 정리 실패',cleanup.error.message)}}
}
export async function signedImage(path){const data=await checked(client.storage.from('writing-submissions').createSignedUrl(path,300));return data.signedUrl;}
