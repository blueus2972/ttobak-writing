const esbuild=require('esbuild'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const output=await esbuild.build({entryPoints:['supabase/functions/student-account/index.ts'],bundle:true,write:false,format:'iife',platform:'neutral',plugins:[{name:'mock-auth',setup(build){build.onResolve({filter:/^npm:/},()=>({path:'mock-api',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const createClient=(url,key,opts)=>globalThis.TEST.createClient(url,key,opts);',loader:'js'}));}}]});
 const accounts=new Map(),users=new Map();let rateLimited=false,rolledBack=0,seq=0,handler;
 const admin={rpc:async(name,args)=>{if(name==='writing_auth_limit')return{data:!rateLimited};if(name==='writing_find_student_account')return{data:accounts.get(args.account_name)||null};if(name==='writing_register_named_student'){if(args.class_code!=='abcdef123456')return{error:{message:'학급 코드를 확인해 주세요.'}};const user=users.get(args.account_id);accounts.set(args.login_name,{email:user.email,active:true,student_id:'student'+seq});return{data:'student'+seq}};throw new Error(name)},auth:{admin:{createUser:async args=>{assert.equal(args.email_confirm,true);assert.equal(args.app_metadata.writing_role,'student');assert.match(args.email,/^student-.*@students\.invalid$/);const user={id:'user'+(++seq),...args};users.set(user.id,user);return{data:{user}}},deleteUser:async id=>{users.delete(id);rolledBack++;return{data:{}}}}}};
 const context={Request,Response,TextEncoder,crypto:globalThis.crypto,console,
 Deno:{env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'secret-test',WRITING_ALLOWED_ORIGINS:'http://localhost'}[key])},serve:fn=>{handler=fn}},
 TEST:{createClient:(url,key,opts)=>{
 assert.equal(opts.auth.persistSession,false);if(key==='secret-test')return admin;
 return {auth:{signInWithPassword:async({email,password})=>{
 const user=[...users.values()].find(u=>u.email===email&&u.password===password);
 return user?{data:{session:{access_token:'access-'+user.id,refresh_token:'refresh-'+user.id}}}:{error:{message:'Invalid login'}};
 }}};
 }}};
 vm.runInNewContext(output.outputFiles[0].text,context);
 async function call(input,origin='http://localhost'){const response=await handler(new Request('http://localhost/functions/v1/student-account',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(input)}));return{status:response.status,data:await response.json()};}
 const signup=await call({action:'register',name:' 내  이름 ',password:'test-password',classCode:'abcdef123456'});assert.equal(signup.status,200);assert.ok(signup.data.refresh_token);assert.equal(accounts.has('내 이름'),true);
 const duplicate=await call({action:'register',name:'내 이름',password:'different-password',classCode:'abcdef123456'});assert.equal(duplicate.status,409);assert.equal(users.size,1);
 const login=await call({action:'login',name:'내 이름',password:'test-password'});assert.equal(login.status,200);assert.equal(login.data.access_token,signup.data.access_token);
 assert.equal((await call({action:'login',name:'내 이름',password:'wrong-password'})).status,401);
 assert.equal((await call({action:'login',name:'없는 이름',password:'test-password'})).status,401);
 assert.equal((await call({action:'register',name:'실패학생',password:'test-password',classCode:'ffffffffffff'})).status,400);assert.equal(rolledBack,1);assert.equal(users.size,1);
 accounts.get('내 이름').active=false;assert.equal((await call({action:'login',name:'내 이름',password:'test-password'})).status,401);accounts.get('내 이름').active=true;
 rateLimited=true;assert.equal((await call({action:'login',name:'내 이름',password:'test-password'})).status,429);rateLimited=false;
 assert.equal((await call({action:'login',name:'내 이름',password:'test-password'},'https://evil.example')).status,403);
 assert.equal((await call({action:'register',name:'내 이름',password:'short'})).status,400);
 console.log('PASS: account function registration/login, normalization, wrong password, duplicate names, rollback, inactive account, rate limits and CORS (mock Auth).');
})().catch(error=>{console.error(error);process.exitCode=1});
