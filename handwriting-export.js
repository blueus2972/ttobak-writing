// Rasterize SVG layout and then draw its text using already loaded browser fonts.
// External SVG images do not inherit the page's Google Fonts, so text is painted separately.
export async function exportPages(){
 await document.fonts.ready;
 const sheets=[...document.querySelectorAll('.sheet')];if(sheets.length>20)throw new Error('한 번에 최대 20장까지 저장·제출할 수 있어요.');
 const result=[];
 for(const sheet of sheets){
 const svg=sheet.querySelector('svg'),ink=sheet.querySelector('canvas'),view=svg.viewBox.baseVal;
 const canvas=document.createElement('canvas');canvas.width=Math.round(view.width*6);canvas.height=Math.round(view.height*6);
 const clone=svg.cloneNode(true);clone.querySelectorAll('text').forEach(text=>text.remove());
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 try{
 const image=new Image();image.src=url;await image.decode();const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 ctx.save();ctx.scale(canvas.width/view.width,canvas.height/view.height);
 for(const text of svg.querySelectorAll('text')){
 const style=getComputedStyle(text);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.fill;let opacity=1;for(let el=text;el&&el!==svg;el=el.parentElement)opacity*=Number(getComputedStyle(el).opacity);ctx.globalAlpha=opacity;
 ctx.textAlign={middle:'center',end:'right',start:'left'}[style.textAnchor]||'left';ctx.textBaseline=['central','middle'].includes(style.dominantBaseline)?'middle':'alphabetic';
 ctx.fillText(text.textContent,Number(text.getAttribute('x')),Number(text.getAttribute('y')));
 }
 ctx.restore();ctx.drawImage(ink,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('이미지를 저장하지 못했어요.');result.push(blob);
 }finally{URL.revokeObjectURL(url)}
 }
 return result;
}
