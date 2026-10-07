import {client,assertConfigured,checked,currentStudent,submitImages,signedImage,escapeHtml as e} from './cloud-client.js';
import {studentPasswordAuth} from './student-auth.js';
const $=id=>document.getElementById(id),teacher=document.body.dataset.portal==='teacher';
let user=null,student=null,classes=[],students=[],submissions=[],selectedClass=null,reviewId=null,viewVersion=0,editingStudent=null,authMode='register';
const status=message=>{$('status').textContent=message;};
function errorText(error){if(error.message?.includes('duplicate key'))return '이미 사용 중인 번호입니다. 다른 번호를 골라 주세요.';return error.message||'처리하지 못했어요. 다시 시도해 주세요.';}
async function task(button,fn){if(button)button.disabled=true;status('');try{await fn()}catch(error){status(errorText(error))}finally{if(button)button.disabled=false}}
function date(value){return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});}
async function initialize(){
 if(!client){$('setup').hidden=false;document.querySelectorAll('form button').forEach(b=>b.disabled=true);return;}
 const {data:{user:authUser},error}=await client.auth.getUser();if(error&&error.name!=='AuthSessionMissingError'){status(error.message)}user=authUser;
 if(teacher){
 if(user&&!user.is_anonymous){
 const allowed=await checked(client.rpc('writing_is_teacher'));
 if(!allowed){$('logout').hidden=false;status('이 이메일은 교사로 등록되지 않았습니다. Supabase 교사 허용 목록에 등록한 뒤 다시 로그인해 주세요.');return;}
 $('teacherAuth').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;await loadClasses();
 }else if(user?.is_anonymous){$('logout').hidden=false;status('학생으로 입장 중입니다. 교사 계정을 사용하려면 먼저 로그아웃해 주세요.');}
 }else{
 if(user&&!user.is_anonymous&&await checked(client.rpc('writing_is_teacher'))){$('logout').hidden=false;status('교사로 로그인 중입니다. 학생 입장 전에 나가기를 눌러 주세요.');return;}
 student=user?await currentStudent():null;
 if(student){if(new URLSearchParams(location.search).get('view')!=='submissions'){location.replace('index.html');return}$('studentAuth').hidden=true;$('studentHome').hidden=false;$('logout').hidden=false;$('studentGreeting').textContent=`${student.name} 학생, 반가워요.`;$('studentClass').textContent=student.classroom.name;await loadMine();}
 else if(user){$('logout').hidden=false;status('학생 정보가 없거나 입장이 중지되어 있습니다. 선생님께 문의하거나 나가기를 누르고 다시 로그인해 주세요.');}
 }
}
async function loadClasses(preferred){
 classes=await checked(client.from('writing_classes').select('*').order('created_at',{ascending:false}));
 $('classSelect').innerHTML=classes.length?classes.map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join(''):'<option value="">학급을 먼저 만들어 주세요</option>';
 selectedClass=classes.find(c=>c.id===preferred)||classes.find(c=>c.id===selectedClass?.id)||classes[0]||null;if(selectedClass)$('classSelect').value=selectedClass.id;await loadClass();
}
async function loadClass(){
 const version=++viewVersion;if(!selectedClass){students=[];submissions=[];drawClass();return;}
 $('practiceText').value=selectedClass.practice_text||'';$('practiceTitle').value=selectedClass.practice_title||'';
 $('classCode').textContent=`학급 코드: ${selectedClass.code} · 학생이 처음 이름과 비밀번호를 등록할 때만 사용합니다.`;
 const [roster,work,accounts]=await Promise.all([checked(client.from('writing_students').select('*').eq('class_id',selectedClass.id).order('name')),checked(client.from('writing_submissions').select('*,writing_students!inner(id,name,number,class_id)').eq('writing_students.class_id',selectedClass.id).order('created_at',{ascending:false})),checked(client.rpc('writing_student_logins',{class_key:selectedClass.id}))]);
 if(version!==viewVersion)return;students=roster.map(s=>({...s,login_name:accounts.find(a=>a.student_id===s.id)?.login_name}));submissions=work;drawClass();
}
function drawClass(){
 if(!selectedClass)$('classCode').textContent='학급을 만들고 학생을 등록해 주세요.';
 $('studentCount').textContent=students.filter(s=>s.active).length;$('submissionCount').textContent=submissions.length;$('pendingCount').textContent=submissions.filter(s=>!s.reviewed_at).length;
 $('roster').innerHTML=students.length?`<table><thead><tr><th>이름</th><th>제출</th><th>입장 관리</th></tr></thead><tbody>${students.map(s=>`<tr><td><b>${e(s.name)}</b><small>로그인 이름: ${e(s.login_name||'이전 코드 방식')}</small>${s.active?'':'<small>입장 중지</small>'}</td><td>${submissions.filter(w=>w.student_id===s.id).length}건</td><td><button data-edit="${s.id}">정보 수정</button><button data-active="${s.id}" data-enabled="${!s.active}">${s.active?'입장 중지':'입장 재개'}</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">학생에게 학급 코드를 알려 주세요. 학생이 가입하면 명단에 자동 등록됩니다.</p>';
 $('roster').querySelectorAll('[data-active]').forEach(b=>b.onclick=()=>task(b,async()=>{const enabled=b.dataset.enabled==='true';if(!confirm(enabled?'이 학생의 입장을 다시 허용할까요?':'이 학생의 입장을 중지할까요? 기존 제출물은 유지됩니다.'))return;await checked(client.rpc('writing_set_student_active',{student_key:b.dataset.active,enabled}));await loadClass();status(enabled?'학생 입장을 다시 허용했습니다.':'학생 입장을 중지했습니다.');}));
 
 $('roster').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editingStudent=students.find(s=>s.id===b.dataset.edit);$('editName').value=editingStudent.name;$('editStatus').textContent='';$('editStudentDialog').showModal();});
 drawSubmissions();
}
function drawSubmissions(){const filter=$('filter').value,query=$('search').value.trim().toLowerCase();const rows=submissions.filter(w=>(filter==='all'||(filter==='pending'?!w.reviewed_at:!!w.reviewed_at))&&`${w.title} ${w.writing_students.name}`.toLowerCase().includes(query));$('submissions').innerHTML=rows.length?rows.map(w=>`<button class="submission-row" data-review="${w.id}"><span><b>${e(w.title)}</b><small>${e(w.writing_students.name)} · ${date(w.created_at)} · ${w.paths.length}장</small></span><span class="badge ${w.reviewed_at?'done':''}">${w.reviewed_at?'피드백 완료':'대기'}</span></button>`).join(''):'<p class="empty">표시할 제출물이 없습니다.</p>';$('submissions').querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>task(b,()=>openReview(b.dataset.review)));}
async function openReview(id){
 const submission=submissions.find(w=>w.id===id);if(!submission)return;reviewId=id;$('reviewTitle').textContent=`${submission.writing_students.name} · ${submission.title}`;$('feedback').value=submission.feedback;$('reviewImages').innerHTML='';$('reviewStatus').textContent='이미지를 불러오는 중…';$('reviewDialog').showModal();
 try{for(let i=0;i<submission.paths.length;i++){const url=await signedImage(submission.paths[i]);if(reviewId!==id)return;const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=url;image.alt=`${submission.writing_students.name}의 제출물 ${i+1}페이지`;caption.textContent=`${i+1} / ${submission.paths.length}`;figure.append(image,caption);$('reviewImages').append(figure)}$('reviewStatus').textContent='이미지 링크는 5분간 유효합니다. 만료되면 닫고 다시 열어 주세요.';}catch(error){$('reviewStatus').textContent=errorText(error);}
}
async function loadMine(){submissions=await checked(client.from('writing_submissions').select('*').eq('student_id',student.id).order('created_at',{ascending:false}));$('mySubmissions').innerHTML=submissions.length?submissions.map(w=>`<article class="my-work"><div class="row between"><h3>${e(w.title)}</h3><span class="badge ${w.reviewed_at?'done':''}">${w.reviewed_at?'피드백 도착':'선생님 확인 대기'}</span></div><small>${date(w.created_at)} · ${w.paths.length}장</small><p class="feedback">${e(w.feedback||'아직 피드백이 없어요.')}</p><button data-images="${w.id}">제출 이미지 보기</button><div id="images-${w.id}" class="student-images" hidden></div></article>`).join(''):'<p class="empty">아직 제출한 연습장이 없어요. 첫 연습을 시작해 보세요!</p>';$('mySubmissions').querySelectorAll('[data-images]').forEach(b=>b.onclick=()=>task(b,async()=>{const area=$('images-'+b.dataset.images);if(!area.hidden){area.hidden=true;return}area.innerHTML='';for(const path of submissions.find(w=>w.id===b.dataset.images).paths){const img=document.createElement('img');img.src=await signedImage(path);img.alt='내가 제출한 연습장';area.append(img)}area.hidden=false;}));}
$('logout').onclick=()=>task($('logout'),async()=>{await checked(client.auth.signOut());location.reload()});
if(teacher){
 $('cancelStudentEdit').onclick=()=>$('editStudentDialog').close();
 $('editStudentForm').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{await checked(client.from('writing_students').update({name:$('editName').value.trim()}).eq('id',editingStudent.id).select('id').single());$('editStudentDialog').close();await loadClass();status('학생 정보를 수정했습니다.');});};
 $('teacherLogin').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{assertConfigured();await checked(client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}));await initialize();});};
 $('signup').onclick=()=>task($('signup'),async()=>{assertConfigured();if(!$('teacherLogin').reportValidity())return;const result=await checked(client.auth.signUp({email:$('email').value.trim(),password:$('password').value,options:{emailRedirectTo:new URL('teacher',location.origin).href}}));if(result.session){await initialize();return}if(result.user?.identities?.length===0){status('이미 가입된 이메일입니다. 가입 때 정한 비밀번호로 로그인해 주세요.');return}status('이메일 인증이 필요한 새 계정은 받은편지함과 스팸함을 확인해 주세요. 이미 가입한 계정이라면 기존 비밀번호로 로그인해 주세요.');});
 $('practiceForm').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{if(!selectedClass)throw new Error('학급을 먼저 만들어 주세요.');await checked(client.from('writing_classes').update({practice_text:$('practiceText').value.trim(),practice_title:$('practiceTitle').value.trim()}).eq('id',selectedClass.id).select('id').single());await loadClasses(selectedClass.id);status('연습 문구를 저장했습니다. 학생이 연습장을 열면 적용됩니다.');});};
 $('createClass').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{const classroom=await checked(client.from('writing_classes').insert({name:$('className').value.trim(),teacher_id:user.id}).select().single());$('className').value='';await loadClasses(classroom.id);});};
 $('classSelect').onchange=()=>task(null,async()=>{selectedClass=classes.find(c=>c.id===$('classSelect').value);await loadClass()});$('refresh').onclick=()=>task($('refresh'),()=>loadClasses());$('filter').onchange=drawSubmissions;$('search').oninput=drawSubmissions;
 $('closeReview').onclick=()=>{$('reviewDialog').close();reviewId=null};$('reviewDialog').addEventListener('close',()=>{reviewId=null});
 $('feedbackForm').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{const id=reviewId;await checked(client.from('writing_submissions').update({feedback:$('feedback').value,reviewed_at:new Date().toISOString()}).eq('id',id).select('id').single());$('reviewStatus').textContent='학생에게 피드백을 전달했습니다.';await loadClass();});};
}else{
 function switchMode(mode){authMode=mode;const register=mode==='register';$('classCodeField').hidden=!register;$('joinClass').required=register;$('confirmPasswordField').hidden=!register;$('confirmPassword').required=register;$('confirmPassword').value='';$('loginPassword').autocomplete=register?'new-password':'current-password';$('registerMode').setAttribute('aria-pressed',register);$('loginMode').setAttribute('aria-pressed',!register);$('studentAuthSubmit').textContent=register?'가입하고 시작하기':'로그인';$('loginDescription').textContent=register?'이름과 비밀번호를 정하면 다음부터 같은 정보로 들어올 수 있어요.':'처음 정한 이름과 비밀번호로 로그인하세요. 학급 코드는 필요 없어요.';}
 $('registerMode').onclick=()=>switchMode('register');$('loginMode').onclick=()=>switchMode('login');
 try{const savedName=localStorage.getItem('ttobak-student-name');if(savedName){$('loginName').value=savedName;authMode='login'}}catch{}switchMode(authMode);
 $('studentLogin').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{assertConfigured();const {data:{session}}=await client.auth.getSession();if(session&&!session.user.is_anonymous&&await checked(client.rpc('writing_is_teacher')))throw new Error('교사 계정에서 먼저 나가기를 눌러 주세요.');if(authMode==='register'&&$('loginPassword').value!==$('confirmPassword').value)throw new Error('두 비밀번호가 같지 않아요. 다시 확인해 주세요.');const name=$('loginName').value.trim();await studentPasswordAuth(authMode,name,$('loginPassword').value,$('joinClass').value);try{localStorage.setItem('ttobak-student-name',name)}catch{}$('loginPassword').value='';$('confirmPassword').value='';await initialize();});};
 $('photoSubmit').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{if(!confirm('선생님께 이름과 연습장 사진을 제출할까요?'))return;status('사진을 제출하고 있어요…');await submitImages(student,$('photoTitle').value,[...$('photoFiles').files]);$('photoSubmit').reset();await loadMine();status('선생님께 제출했어요!');});};$('studentRefresh').onclick=()=>task($('studentRefresh'),async()=>{student=await currentStudent();if(!student){location.reload();return}await loadMine()});
}
initialize().catch(error=>status(errorText(error)));


