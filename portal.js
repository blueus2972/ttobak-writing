import {client,assertConfigured,checked,currentStudent,submitImages,signedImage,escapeHtml as e} from './cloud-client.js';
const $=id=>document.getElementById(id),teacher=document.body.dataset.portal==='teacher';
let user=null,student=null,classes=[],students=[],submissions=[],selectedClass=null,reviewId=null,viewVersion=0,editingStudent=null;
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
 if(user&&!user.is_anonymous){$('logout').hidden=false;status('교사로 로그인 중입니다. 학생 입장 전에 나가기를 눌러 주세요.');return;}
 student=user?await currentStudent():null;
 if(student){$('studentAuth').hidden=true;$('studentHome').hidden=false;$('logout').hidden=false;$('studentGreeting').textContent=`${student.name} 학생, 반가워요.`;$('studentClass').textContent=`${student.classroom.name} · ${student.number}번`;await loadMine();}
 }
}
async function loadClasses(preferred){
 classes=await checked(client.from('writing_classes').select('*').order('created_at',{ascending:false}));
 $('classSelect').innerHTML=classes.length?classes.map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join(''):'<option value="">학급을 먼저 만들어 주세요</option>';
 selectedClass=classes.find(c=>c.id===preferred)||classes.find(c=>c.id===selectedClass?.id)||classes[0]||null;if(selectedClass)$('classSelect').value=selectedClass.id;await loadClass();
}
async function loadClass(){
 const version=++viewVersion;if(!selectedClass){students=[];submissions=[];drawClass();return;}
 $('classCode').textContent=`학급 코드: ${selectedClass.code} · 학생에게 개인 입장 코드와 함께 전달하세요.`;
 const [roster,work]=await Promise.all([checked(client.from('writing_students').select('*').eq('class_id',selectedClass.id).order('number')),checked(client.from('writing_submissions').select('*,writing_students!inner(id,name,number,class_id)').eq('writing_students.class_id',selectedClass.id).order('created_at',{ascending:false}))]);
 if(version!==viewVersion)return;students=roster;submissions=work;drawClass();
}
function drawClass(){
 if(!selectedClass)$('classCode').textContent='학급을 만들고 학생을 등록해 주세요.';
 $('studentCount').textContent=students.filter(s=>s.active).length;$('submissionCount').textContent=submissions.length;$('pendingCount').textContent=submissions.filter(s=>!s.reviewed_at).length;
 $('studentNumber').value=students.length?Math.min(999,Math.max(...students.map(s=>s.number))+1):1;
 $('roster').innerHTML=students.length?`<table><thead><tr><th>번호·이름</th><th>제출</th><th>입장 관리</th></tr></thead><tbody>${students.map(s=>`<tr><td><b>${s.number}번 ${e(s.name)}</b>${s.active?'':'<small>입장 중지</small>'}</td><td>${submissions.filter(w=>w.student_id===s.id).length}건</td><td><button data-edit="${s.id}">정보 수정</button><button data-code="${s.id}">${s.active?'코드 재발급':'입장 재개'}</button>${s.active?`<button data-disable="${s.id}">중지</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">첫 학생을 추가해 주세요.</p>';
 $('roster').querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>task(b,async()=>{if(!confirm('입장 코드를 새로 발급할까요? 기존 코드는 사용할 수 없으며 학생은 다시 입장해야 합니다.'))return;const code=await checked(client.rpc('writing_reset_student',{student_key:b.dataset.code,disable:false}));showCode(students.find(s=>s.id===b.dataset.code),code);await loadClass();}));
 $('roster').querySelectorAll('[data-disable]').forEach(b=>b.onclick=()=>task(b,async()=>{if(!confirm('이 학생의 입장을 중지할까요? 기존 제출물은 유지됩니다.'))return;await checked(client.rpc('writing_reset_student',{student_key:b.dataset.disable,disable:true}));await loadClass();status('학생 입장을 중지했습니다.');}));
 
 $('roster').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editingStudent=students.find(s=>s.id===b.dataset.edit);$('editNumber').value=editingStudent.number;$('editName').value=editingStudent.name;$('editStatus').textContent='';$('editStudentDialog').showModal();});
 drawSubmissions();
}
function showCode(s,code){const box=$('issuedCode');box.hidden=false;box.innerHTML=`<b>${s.number}번 ${e(s.name)} · 개인 입장 코드</b><code>${e(code)}</code><p>이 코드는 지금 한 번만 표시됩니다. 학생에게 개인적으로 전달하고 보관해 주세요.</p><button id="copyCode">코드 복사</button>`;$('copyCode').onclick=()=>task($('copyCode'),async()=>{await navigator.clipboard.writeText(`학급 코드: ${selectedClass.code}\n학생 입장 코드: ${code}`);status('코드를 복사했습니다.');});}
function drawSubmissions(){const filter=$('filter').value,query=$('search').value.trim().toLowerCase();const rows=submissions.filter(w=>(filter==='all'||(filter==='pending'?!w.reviewed_at:!!w.reviewed_at))&&`${w.title} ${w.writing_students.name}`.toLowerCase().includes(query));$('submissions').innerHTML=rows.length?rows.map(w=>`<button class="submission-row" data-review="${w.id}"><span><b>${e(w.title)}</b><small>${w.writing_students.number}번 ${e(w.writing_students.name)} · ${date(w.created_at)} · ${w.paths.length}장</small></span><span class="badge ${w.reviewed_at?'done':''}">${w.reviewed_at?'피드백 완료':'대기'}</span></button>`).join(''):'<p class="empty">표시할 제출물이 없습니다.</p>';$('submissions').querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>task(b,()=>openReview(b.dataset.review)));}
async function openReview(id){
 const submission=submissions.find(w=>w.id===id);if(!submission)return;reviewId=id;$('reviewTitle').textContent=`${submission.writing_students.name} · ${submission.title}`;$('feedback').value=submission.feedback;$('reviewImages').innerHTML='';$('reviewStatus').textContent='이미지를 불러오는 중…';$('reviewDialog').showModal();
 try{for(let i=0;i<submission.paths.length;i++){const url=await signedImage(submission.paths[i]);if(reviewId!==id)return;const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=url;image.alt=`${submission.writing_students.name}의 제출물 ${i+1}페이지`;caption.textContent=`${i+1} / ${submission.paths.length}`;figure.append(image,caption);$('reviewImages').append(figure)}$('reviewStatus').textContent='이미지 링크는 5분간 유효합니다. 만료되면 닫고 다시 열어 주세요.';}catch(error){$('reviewStatus').textContent=errorText(error);}
}
async function loadMine(){submissions=await checked(client.from('writing_submissions').select('*').eq('student_id',student.id).order('created_at',{ascending:false}));$('mySubmissions').innerHTML=submissions.length?submissions.map(w=>`<article class="my-work"><div class="row between"><h3>${e(w.title)}</h3><span class="badge ${w.reviewed_at?'done':''}">${w.reviewed_at?'피드백 도착':'선생님 확인 대기'}</span></div><small>${date(w.created_at)} · ${w.paths.length}장</small><p class="feedback">${e(w.feedback||'아직 피드백이 없어요.')}</p><button data-images="${w.id}">제출 이미지 보기</button><div id="images-${w.id}" class="student-images" hidden></div></article>`).join(''):'<p class="empty">아직 제출한 연습장이 없어요. 첫 연습을 시작해 보세요!</p>';$('mySubmissions').querySelectorAll('[data-images]').forEach(b=>b.onclick=()=>task(b,async()=>{const area=$('images-'+b.dataset.images);if(!area.hidden){area.hidden=true;return}area.innerHTML='';for(const path of submissions.find(w=>w.id===b.dataset.images).paths){const img=document.createElement('img');img.src=await signedImage(path);img.alt='내가 제출한 연습장';area.append(img)}area.hidden=false;}));}
$('logout').onclick=()=>task($('logout'),async()=>{await checked(client.auth.signOut());location.reload()});
if(teacher){
 $('cancelStudentEdit').onclick=()=>$('editStudentDialog').close();
 $('editStudentForm').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{await checked(client.from('writing_students').update({name:$('editName').value.trim(),number:+$('editNumber').value}).eq('id',editingStudent.id).select('id').single());$('editStudentDialog').close();await loadClass();status('학생 정보를 수정했습니다.');});};
 $('teacherLogin').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{assertConfigured();await checked(client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}));await initialize();});};
 $('signup').onclick=()=>task($('signup'),async()=>{assertConfigured();if(!$('teacherLogin').reportValidity())return;await checked(client.auth.signUp({email:$('email').value.trim(),password:$('password').value}));status('가입 이메일의 인증 링크를 누른 뒤 로그인해 주세요.');});
 $('createClass').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{const classroom=await checked(client.from('writing_classes').insert({name:$('className').value.trim(),teacher_id:user.id}).select().single());$('className').value='';await loadClasses(classroom.id);});};
 $('addStudent').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{if(!selectedClass)throw new Error('학급을 먼저 만들어 주세요.');const name=$('studentName').value.trim(),number=+$('studentNumber').value;const result=await checked(client.rpc('writing_add_student',{class_key:selectedClass.id,student_name:name,student_number:number}));showCode({name,number},result.code);$('studentName').value='';await loadClass();});};
 $('classSelect').onchange=()=>task(null,async()=>{selectedClass=classes.find(c=>c.id===$('classSelect').value);$('issuedCode').hidden=true;await loadClass()});$('refresh').onclick=()=>task($('refresh'),()=>loadClasses());$('filter').onchange=drawSubmissions;$('search').oninput=drawSubmissions;
 $('closeReview').onclick=()=>{$('reviewDialog').close();reviewId=null};$('reviewDialog').addEventListener('close',()=>{reviewId=null});
 $('feedbackForm').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{const id=reviewId;await checked(client.from('writing_submissions').update({feedback:$('feedback').value,reviewed_at:new Date().toISOString()}).eq('id',id).select('id').single());$('reviewStatus').textContent='학생에게 피드백을 전달했습니다.';await loadClass();});};
}else{
 $('studentLogin').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{assertConfigured();const {data:{session}}=await client.auth.getSession();if(session&&!session.user.is_anonymous)throw new Error('교사 계정에서 먼저 나가기를 눌러 주세요.');if(!session)await checked(client.auth.signInAnonymously());await checked(client.rpc('writing_join',{class_code:$('joinClass').value.trim().toLowerCase(),student_code:$('joinStudent').value.trim().toLowerCase()}));$('joinStudent').value='';await initialize();});};
 $('photoSubmit').onsubmit=event=>{event.preventDefault();task(event.submitter,async()=>{if(!confirm('선생님께 이름과 연습장 사진을 제출할까요?'))return;status('사진을 제출하고 있어요…');await submitImages(student,$('photoTitle').value,[...$('photoFiles').files]);$('photoSubmit').reset();await loadMine();status('선생님께 제출했어요!');});};$('studentRefresh').onclick=()=>task($('studentRefresh'),async()=>{student=await currentStudent();if(!student){location.reload();return}await loadMine()});
}
initialize().catch(error=>status(errorText(error)));


