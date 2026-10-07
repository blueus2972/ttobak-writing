import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
const projectUrl=Deno.env.get('SUPABASE_URL')!;
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowed=(Deno.env.get('WRITING_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(projectUrl,serviceKey,options);
const normalize=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':allowed.length?(allowed.includes(origin)?origin:allowed[0]):'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(message:unknown,status=200)=>Response.json(message,{status,headers});
 if(origin&&allowed.length&&!allowed.includes(origin))return reply({error:'허용되지 않은 접속입니다.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'지원하지 않는 요청입니다.'},405);
 try{
 const raw=await request.text();if(raw.length>4096)return reply({error:'입력 내용이 너무 깁니다.'},400);
 const input=JSON.parse(raw),action=input.action,name=typeof input.name==='string'?normalize(input.name):'',password=input.password;
 if(!['register','login'].includes(action)||!name||name.length>50||typeof password!=='string'||password.length<8||password.length>128)return reply({error:'이름과 8~128자 비밀번호를 입력해 주세요.'},400);
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||request.headers.get('cf-connecting-ip')||'unknown';
 for(const [key,max] of [[`ip:${await hash(serviceKey+ip)}`,300],[`name:${await hash(name)}`,15]] as const){const {data,error}=await admin.rpc('writing_auth_limit',{limit_key:key,max_attempts:max});if(error)return reply({error:'학생 로그인 설정을 확인해 주세요.'},503);if(!data)return reply({error:'시도가 너무 많습니다. 10분 후 다시 시도해 주세요.'},429);}
 let email:string;
 if(action==='register'){
 const classCode=typeof input.classCode==='string'?input.classCode.trim().toLowerCase():'';
 if(!/^[a-f0-9]{12}$/.test(classCode))return reply({error:'선생님께 받은 학급 코드를 입력해 주세요.'},400);
 const existing=await admin.rpc('writing_find_student_account',{account_name:name});if(existing.error)return reply({error:'학생 가입 설정을 확인해 주세요.'},503);
 if(existing.data)return reply({error:'이미 사용 중인 이름입니다. 로그인하거나 이름 뒤에 반·번호를 붙여 주세요.'},409);
 email=`student-${crypto.randomUUID()}@students.invalid`;
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{writing_role:'student'}});
 if(error||!data.user)return reply({error:'계정을 만들지 못했습니다. 비밀번호 조건을 확인해 주세요.'},400);
 const account=await admin.rpc('writing_register_named_student',{account_id:data.user.id,login_name:name,student_name:input.name.normalize('NFKC').trim().replace(/\s+/g,' '),class_code:classCode});
 if(account.error){const cleanup=await admin.auth.admin.deleteUser(data.user.id);if(cleanup.error)console.error('Student account rollback failed:',data.user.id);return reply({error:account.error.code==='23505'?'이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.':account.error.message},400);}
 }else{
 const account=await admin.rpc('writing_find_student_account',{account_name:name});if(account.error)return reply({error:'학생 로그인 설정을 확인해 주세요.'},503);
 if(!account.data||!account.data.active)return reply({error:'이름 또는 비밀번호를 확인해 주세요. 입장이 중지된 경우 선생님께 문의하세요.'},401);
 email=account.data.email;
 }
 const auth=createClient(projectUrl,publicKey,options);
 const {data,error}=await auth.auth.signInWithPassword({email,password});
 if(error||!data.session)return reply({error:'이름 또는 비밀번호를 확인해 주세요.'},401);
 return reply({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return reply({error:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},400);}
});
