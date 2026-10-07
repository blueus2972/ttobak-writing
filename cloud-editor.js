import {client,currentStudent,submitImages} from './cloud-client.js';
import {exportPages} from './handwriting-export.js';
const save=document.getElementById('saveImage'),submit=document.getElementById('submitWork'),note=document.getElementById('studentIdentity');
let student=null;
function status(text){note.textContent=text;}
async function refresh(){try{student=client?await currentStudent():null;status(student?`${student.classroom.name} · ${student.number}번 ${student.name}`:'학생 입장 후 연습장을 선생님께 제출할 수 있어요.');}catch{status('학생 입장 상태를 확인하지 못했어요. 다시 입장해 주세요.');}}
save.onclick=async()=>{save.disabled=true;try{const blobs=await exportPages();for(let i=0;i<blobs.length;i++){const url=URL.createObjectURL(blobs[i]),a=document.createElement('a');a.href=url;a.download=`또박또박-${i+1}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}status(`${blobs.length}장의 이미지를 저장했어요. 여러 장일 때 브라우저의 다운로드 허용이 필요할 수 있어요.`);}catch(error){status(error.message)}finally{save.disabled=false}};
submit.onclick=async()=>{
 if(!student){location.href='student.html';return;}
 const title=document.getElementById('title').value||'손글씨 연습';
 if(!confirm(`${student.classroom.name}의 ${student.name} 학생으로 현재 연습장을 제출할까요?`))return;
 submit.disabled=true;save.disabled=true;status('연습장을 이미지로 만들고 제출하고 있어요…');
 try{const images=await exportPages();await submitImages(student,title,images);status('제출했어요! 학생 페이지에서 선생님의 피드백을 확인하세요.');}catch(error){status(`제출 실패: ${error.message}`)}finally{submit.disabled=false;save.disabled=false}
};refresh();
