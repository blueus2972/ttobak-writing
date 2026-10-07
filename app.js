'use strict';
const $=id=>document.getElementById(id);
const ids=['text','repeat','opacity','solid','fade','numbers','grid','cell','gap','gridOpacity','font','size','weight','background','color','border','decoration','title','footer','meta','orientation','margin'];
const defaults=Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));
let imageData='',writing=false,strokes=[],current=null,eraser=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const value=id=>$(id).type==='checkbox'?$(id).checked:$(id).value;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2500)}
function snapshot(){return Object.fromEntries(ids.map(id=>[id,value(id)]))}
function apply(config){for(const id of ids){if(config[id]===undefined)continue;if($(id).type==='checkbox')$(id).checked=Boolean(config[id]);else $(id).value=config[id]}}
function render(){
 const s=snapshot(),cell=+s.cell,gap=+s.gap,margin=+s.margin,wide=s.orientation==='landscape',w=wide?297:210,h=wide?210:297;
 const usable=w-2*margin,cols=Math.floor(usable/cell),gridW=cols*cell,x0=(w-gridW)/2,top=margin+28,bottom=h-margin-14,capacity=Math.max(1,Math.floor((bottom-top)/(cell+gap)));
 const rows=[];
 for(const sentence of s.text.split('\n')){const chars=Array.from(sentence),chunks=[];if(s.grid==='lines'||s.grid==='baseline'){let chunk='';for(const char of chars){chunk+=char;if(Array.from(chunk).length>=Math.max(cols,Math.floor(usable/(cell*.43)))){chunks.push(chunk);chunk=''}}if(chunk||!chunks.length)chunks.push(chunk)}else{for(let i=0;i<chars.length;i+=cols)chunks.push(chars.slice(i,i+cols).join(''));if(!chunks.length)chunks.push('')}
 for(const chunk of chunks)for(let r=0;r<+s.repeat;r++)rows.push({text:chunk,opacity:s.solid&&r===0?1:(+s.opacity/100)*(s.fade?1-r/(+s.repeat):1)});}
 const pageCount=Math.max(1,Math.ceil(rows.length/capacity));$('pageCount').textContent=`A4 · ${pageCount}장`;
 for(const id of ['repeat','opacity','cell','gap','gridOpacity','size','margin'])$(id+'Value').textContent=value(id)+({repeat:'줄',opacity:'%',cell:'mm',gap:'mm',gridOpacity:'%',size:'%',margin:'mm'}[id]);
 $('fontDemo').style.fontFamily=`'${s.font}',sans-serif`;
 let markup='';const color=esc(s.color),line=(x1,y1,x2,y2,dash='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width=".18" ${dash?'stroke-dasharray=".7 .8"':''}/>`;
 for(let p=0;p<pageCount;p++){
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" role="img" aria-label="손글씨 연습장 ${p+1}페이지"><rect width="${w}" height="${h}" fill="${esc(s.background)}"/>`;
 if(s.border!=='none'){svg+=`<rect x="${margin-5}" y="${margin-5}" width="${w-2*margin+10}" height="${h-2*margin+10}" rx="${s.border==='rounded'?3:0}" fill="none" stroke="${color}" stroke-opacity=".5" stroke-width=".25" ${s.border==='dashed'?'stroke-dasharray="1 1"':''}/>`;if(s.border==='double')svg+=`<rect x="${margin-3}" y="${margin-3}" width="${w-2*margin+6}" height="${h-2*margin+6}" fill="none" stroke="${color}" stroke-opacity=".4" stroke-width=".2"/>`}
 const motif={flower:'❀  ✿  ❀',star:'✧  ⋆  ✧',leaf:'❧  ❧  ❧',none:''}[s.decoration];
 svg+=`<g fill="${color}" text-anchor="middle"><text x="${w/2}" y="${margin+3}" font-size="5" opacity=".55">${motif}</text><text x="${w/2}" y="${margin+13}" font-family="${esc(s.font)}, sans-serif" font-size="6">${esc(s.title)}</text></g>`;
 if(s.meta)svg+=`<text x="${w-margin}" y="${margin+22}" fill="${color}" text-anchor="end" font-family="sans-serif" font-size="2.8">이름 ______________    날짜 ______________</text>`;
 if(imageData)svg+=`<image x="${w-margin-22}" y="${margin-1}" width="18" height="18" href="${esc(imageData)}"/>`;
 const slice=rows.slice(p*capacity,(p+1)*capacity);
 for(let r=0;r<capacity;r++){
 const y=top+r*(cell+gap),row=slice[r];svg+=`<g opacity="${+s.gridOpacity/100}">`;
 if(['cross','dotted','mi','box'].includes(s.grid)){svg+=`<rect x="${x0}" y="${y}" width="${gridW}" height="${cell}" fill="none" stroke="${color}" stroke-width=".2"/>`;
 for(let c=0;c<cols;c++){const x=x0+c*cell;if(c)svg+=line(x,y,x,y+cell);if(s.grid!=='box'){svg+=line(x+cell/2,y,x+cell/2,y+cell,s.grid==='dotted')+line(x,y+cell/2,x+cell,y+cell/2,s.grid==='dotted');if(s.grid==='mi')svg+=line(x,y,x+cell,y+cell,true)+line(x+cell,y,x,y+cell,true)}}
 }else if(s.grid==='lines'){for(const f of [0,.33,.66,1])svg+=line(x0,y+cell*f,x0+gridW,y+cell*f,f===.33||f===.66)}else if(s.grid==='baseline')svg+=line(x0,y+cell,x0+gridW,y+cell);svg+='</g>';
 if(s.numbers)svg+=`<text x="${x0-2}" y="${y+cell*.6}" text-anchor="end" font-size="2.4" fill="${color}" opacity=".6">${p*capacity+r+1}</text>`;
 if(row){const attrs=`fill="${color}" opacity="${row.opacity}" font-family="${esc(s.font)}, sans-serif" font-weight="${s.weight}" font-size="${cell*(+s.size/100)}"`;
 if(['lines','baseline'].includes(s.grid))svg+=`<text x="${x0+1}" y="${y+cell*.79}" ${attrs}>${esc(row.text)}</text>`;
 else Array.from(row.text).forEach((char,c)=>{svg+=`<text x="${x0+c*cell+cell/2}" y="${y+cell*.5}" dominant-baseline="central" text-anchor="middle" ${attrs}>${esc(char)}</text>`})}
 }
 svg+=`<text x="${w/2}" y="${h-margin-1}" fill="${color}" opacity=".65" font-family="${esc(s.font)},sans-serif" font-size="3" text-anchor="middle">${esc(s.footer)}</text><text x="${w-margin}" y="${h-margin+5}" fill="${color}" opacity=".4" font-size="2.2" text-anchor="end">${p+1} / ${pageCount}</text></svg>`;
 markup+=`<div class="sheet">${svg}<canvas data-page="${p}" width="${Math.round(w*5)}" height="${Math.round(h*5)}" aria-label="${p+1}페이지 쓰기 영역"></canvas></div>`;
 }
 $('pages').innerHTML=markup;
 $('printStyle')?.remove();const style=document.createElement('style');style.id='printStyle';style.textContent=`@media print{@page{size:A4 ${s.orientation};margin:0}.sheet{width:${w}mm;height:${h}mm}}`;document.head.append(style);
 bindCanvas();paint();
}
function paint(){document.querySelectorAll('.sheet canvas').forEach(canvas=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);for(const stroke of [...strokes,...(current?[current]:[])]){if(stroke.page!==+canvas.dataset.page)continue;ctx.globalCompositeOperation=stroke.erase?'destination-out':'source-over';ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();stroke.points.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));if(stroke.points.length===1){const [x,y]=stroke.points[0];ctx.lineTo(x*canvas.width+.1,y*canvas.height+.1)}ctx.stroke()}ctx.globalCompositeOperation='source-over'})}
function bindCanvas(){document.querySelectorAll('.sheet canvas').forEach(canvas=>{const point=e=>{const rect=canvas.getBoundingClientRect();return[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height]};canvas.onpointerdown=e=>{if(!writing)return;canvas.setPointerCapture(e.pointerId);current={page:+canvas.dataset.page,color:$('penColor').value,width:+$('penWidth').value*canvas.width/canvas.getBoundingClientRect().width,erase:eraser,points:[point(e)]};paint()};canvas.onpointermove=e=>{if(current&&canvas.hasPointerCapture(e.pointerId)){current.points.push(point(e));paint()}};const finish=()=>{if(current){strokes.push(current);current=null;paint()}};canvas.onpointerup=finish;canvas.onpointercancel=finish})}
ids.forEach(id=>$(id).addEventListener('input',()=>{strokes=[];current=null;render()}));
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==button.dataset.tab)});
document.querySelectorAll('[data-sample]').forEach(b=>b.onclick=()=>{$('text').value=b.dataset.sample;$('grid').value=b.dataset.sample.startsWith('abc')?'lines':'cross';strokes=[];render()});
const themes={cream:['#fffdf5','#657765'],mint:['#f3fbf5','#527d6b'],pink:['#fff6f6','#aa7481'],blue:['#f5faff','#64869f'],white:['#ffffff','#555555'],purple:['#faf6ff','#8a77a0']};document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{[$('background').value,$('color').value]=themes[b.dataset.theme];render()});
$('settings').onsubmit=e=>e.preventDefault();
$('image').onchange=()=>{const file=$('image').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('5MB 이하의 PNG, JPG, WebP 이미지를 골라 주세요.');$('image').value='';return}const reader=new FileReader();reader.onload=()=>{imageData=reader.result;render()};reader.readAsDataURL(file)};
$('removeImage').onclick=()=>{imageData='';$('image').value='';render()};
$('write').onclick=()=>{writing=!writing;document.body.classList.toggle('writing',writing);$('inkTools').hidden=!writing;$('write').textContent=writing?'✓ 쓰기 마치기':'✎ 직접 쓰기';$('write').setAttribute('aria-pressed',writing);if(writing)toast('연습장 위에 마우스나 펜으로 써 보세요.')};
$('eraser').onclick=()=>{eraser=!eraser;$('eraser').textContent=eraser?'펜으로 바꾸기':'지우개';$('eraser').setAttribute('aria-pressed',eraser)};$('undo').onclick=()=>{strokes.pop();paint()};$('clear').onclick=()=>{strokes=[];paint()};
$('print').onclick=async()=>{await document.fonts.ready;window.print()};
$('save').onclick=()=>{try{localStorage.setItem('ttobak-settings-v1',JSON.stringify(snapshot()));toast('이 브라우저에 설정을 저장했어요.')}catch{toast('브라우저에서 설정 저장을 사용할 수 없어요.')}};
$('reset').onclick=()=>{apply(defaults);imageData='';strokes=[];try{localStorage.removeItem('ttobak-settings-v1')}catch{}render();toast('기본 연습장으로 돌아왔어요.')};
try{const saved=JSON.parse(localStorage.getItem('ttobak-settings-v1'));if(saved&&typeof saved==='object')apply(saved)}catch{}
render();

// Explicit control names keep labels stable when output values change.
document.querySelectorAll('label').forEach(label=>{const control=label.querySelector('input,textarea,select');if(control&&!control.hasAttribute('aria-label')){const name=Array.from(label.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();if(name)control.setAttribute('aria-label',name)}});
