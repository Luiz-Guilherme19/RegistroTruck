var KEY="entregas_v1",items=[];
try{items=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){items=[]}
var hoje=new Date().toISOString().slice(0,10);
document.getElementById("data").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
var armed=-1,tm;
function maps(e){return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="+encodeURIComponent(e)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(items))}catch(e){}}
function esc(s){return s.replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function render(){
  var L=document.getElementById("lista");
  if(!items.length){L.innerHTML='<div class="empty">Nenhuma entrega ainda.<br>Toque em <b>+</b> para adicionar.</div>';return}
  L.innerHTML=items.map(function(it,i){
    var s=it.dia===hoje?it.status:"";
    var b=s==="ok"?'<span class="badge b-ok">Concluída hoje</span>':s==="no"?'<span class="badge b-no">Não concluída</span>':"";
    return '<div class="card'+(s?" done":"")+'" data-i="'+i+'"><div class="info"><div class="nome">'+esc(it.nome)+'</div><div class="end">'+esc(it.end)+'</div><a class="rota" href="'+maps(it.end)+'" target="_blank" rel="noopener noreferrer">📍 Ver rota no Maps</a>'+b+'<button class="del'+(armed===i?" arm":"")+'" data-a="del" data-i="'+i+'">'+(armed===i?"Toque de novo para excluir":"🗑 Excluir")+'</button></div><div class="acts"><button class="btn ok'+(s==="no"?" off":"")+'" data-a="ok" data-i="'+i+'" aria-label="Concluída">✓</button><button class="btn no'+(s==="ok"?" off":"")+'" data-a="no" data-i="'+i+'" aria-label="Não concluída">✕</button></div></div>'
  }).join("")
}
document.getElementById("lista").addEventListener("click",function(ev){
  var d=ev.target.closest(".del");
  if(d){ev.stopPropagation();var k=+d.dataset.i;clearTimeout(tm);
    if(armed===k){items.splice(k,1);armed=-1;save()}
    else{armed=k;tm=setTimeout(function(){armed=-1;render()},3500)}
    render();return}
  if(ev.target.closest("a"))return;
  var btn=ev.target.closest(".btn");
  if(btn){ev.stopPropagation();var i=+btn.dataset.i;items[i].status=btn.dataset.a;items[i].dia=hoje;save();render();return}
  var c=ev.target.closest(".card");
  if(c){var a=document.createElement("a");a.href=maps(items[+c.dataset.i].end);a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove()}
});
function aba(n){
  document.getElementById("lista").classList.toggle("hide",n===2);
  document.getElementById("novo").classList.toggle("hide",n===1);
  document.getElementById("t1").classList.toggle("on",n===1);
  document.getElementById("t2").classList.toggle("on",n===2);
  document.getElementById("fab").classList.toggle("hide",n===2);
}
document.getElementById("t1").onclick=function(){aba(1)};
document.getElementById("t2").onclick=function(){aba(2)};
document.getElementById("fab").onclick=function(){aba(2)};
document.getElementById("f").onsubmit=function(ev){
  ev.preventDefault();
  items.push({nome:document.getElementById("n").value.trim(),end:document.getElementById("e").value.trim(),status:"",dia:""});
  save();ev.target.reset();render();aba(1);
};
render();