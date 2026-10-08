(function(){
var K="viagem_v1";
function $(i){return document.getElementById(i)}
function fn(n,d){return n.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d})}
function num(s){var n=parseFloat(String(s).replace(",","."));return isFinite(n)&&n>0?n:0}
function hms(ms){var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);s%=60;return [h,m,s].map(function(x){return (x<10?"0":"")+x}).join(":")}

var V={st:"idle",km:0,ms:0,kmpl:0,modelo:"",ult:""};
try{var o=JSON.parse(localStorage.getItem(K)||"null");if(o){V.km=+o.km||0;V.ms=+o.ms||0;V.kmpl=+o.kmpl||0;V.modelo=o.modelo||"";V.ult=o.ult||"";V.st=(o.st==="running"||o.st==="paused")?"paused":"idle"}}catch(e){}
var segStart=0,lastPt=null,wl=null,armed=false,tmArm=null,acc=null,tick=0;

function tot(){return V.ms+(V.st==="running"?Date.now()-segStart:0)}
function salvar(){try{localStorage.setItem(K,JSON.stringify({km:V.km,ms:tot(),kmpl:V.kmpl,modelo:V.modelo,ult:V.ult,st:V.st}))}catch(e){}}
function wake(on){
  if(!("wakeLock" in navigator))return;
  if(on){navigator.wakeLock.request("screen").then(function(l){wl=l;l.addEventListener("release",function(){wl=null})}).catch(function(){})}
  else if(wl){wl.release().catch(function(){});wl=null}
}

function draw(){
  var ms=tot(),run=V.st==="running";
  $("vkm").textContent=fn(V.km,1);
  $("vtempo").textContent=hms(ms);
  $("vlit").textContent=V.kmpl>0?fn(V.km/V.kmpl,1)+" L":"—";
  $("vvel").textContent=ms>60000?fn(V.km/(ms/3600000),0):"—";
  $("vcalc").textContent=V.kmpl>0?"Consumo "+fn(V.kmpl,1)+" km/L = "+fn(1/V.kmpl,2)+" L por km · "+fn(V.km,1)+" km × "+fn(1/V.kmpl,2)+" L/km = "+fn(V.km/V.kmpl,1)+" L":"Informe o modelo ou o consumo (km/L) para calcular o combustível.";
  var st=$("vst");st.className="vst "+V.st;
  st.textContent=run?"● Em andamento":V.st==="paused"?"⏸ Pausada":"Parada";
  var mb=$("vmain");
  mb.textContent=V.st==="idle"?"▶ Iniciar viagem":run?"⏸ Pausar":"▶ Retomar";
  mb.className="vmain "+(run?"pause":"go");
  var fim=$("vfim");fim.classList.toggle("hide",V.st==="idle");fim.classList.toggle("arm",armed);
  fim.textContent=armed?"Toque de novo para finalizar":"■ Finalizar";
  var u=$("vult");u.textContent=V.ult?"Última viagem: "+V.ult:"";u.classList.toggle("hide",!V.ult);
  var g=$("vgps");
  if(run)g.textContent=(typeof pos!=="undefined"&&pos)?"📡 GPS ativo"+(acc?" · precisão ±"+Math.round(acc)+" m":"")+" · mantenha a tela ligada":"📡 Aguardando sinal do GPS…";
  else if(V.st==="paused")g.textContent="Viagem pausada: o km não conta enquanto estiver pausada.";
  else g.textContent="Toque em Iniciar e mantenha a tela ligada para o GPS contar os km.";
}

window.tripFeed=function(p){
  var c=p.coords;acc=c.accuracy;
  if(V.st!=="running")return;
  if(!c.accuracy||c.accuracy>50)return;
  var pt={lat:c.latitude,lon:c.longitude,t:p.timestamp||Date.now()};
  if(!lastPt){lastPt=pt;return}
  var d=hav(lastPt.lat,lastPt.lon,pt.lat,pt.lon)*1000,dt=(pt.t-lastPt.t)/1000;
  if(dt<=0)return;
  if(d<Math.max(12,c.accuracy*0.6))return;
  if(d/dt>45)return;
  if(c.speed!=null&&c.speed<0.8&&d<40)return;
  V.km+=d/1000;lastPt=pt;draw();
};

$("vmain").onclick=function(){
  if(V.st==="idle"){V.km=0;V.ms=0;V.st="running";segStart=Date.now();lastPt=null;wake(true);if(typeof geoState!=="undefined"&&geoState!=="ok")startGeo()}
  else if(V.st==="running"){V.ms=tot();V.st="paused";lastPt=null;wake(false)}
  else{V.st="running";segStart=Date.now();lastPt=null;wake(true);if(typeof geoState!=="undefined"&&geoState!=="ok")startGeo()}
  salvar();draw();
};
$("vfim").onclick=function(){
  if(!armed){armed=true;clearTimeout(tmArm);tmArm=setTimeout(function(){armed=false;draw()},3500);draw();return}
  armed=false;
  var ms=tot();
  V.ult=new Date().toLocaleDateString("pt-BR")+" · "+fn(V.km,1)+" km · "+hms(ms)+(V.kmpl>0?" · "+fn(V.km/V.kmpl,1)+" L":"");
  V.st="idle";V.km=0;V.ms=0;lastPt=null;wake(false);salvar();draw();
};

/* ---------- caminhão e consumo ---------- */
$("vmod").value=V.modelo;
$("vkmpl").value=V.kmpl>0?fn(V.kmpl,1):"";
$("vmod").oninput=function(){V.modelo=this.value.trim();salvar()};
$("vkmpl").oninput=function(){V.kmpl=num(this.value);salvar();draw()};
$("vcat").onchange=function(){
  if(!this.value)return;
  V.kmpl=+this.value;$("vkmpl").value=fn(V.kmpl,1);salvar();draw();
};
/* ---------- pesquisa de consumo ---------- */
function msg(h){var r=$("vres");r.innerHTML=h;r.classList.remove("hide")}
function norm(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function mediana(a){a=a.slice().sort(function(x,y){return x-y});var m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2}
/* médias de referência (km/L, uso rodoviário com carga) - valores aproximados */
var BASE=[
  [/volvo vm/,3,4,"Volvo VM"],[/volvo|\bfh\b/,2.2,2.8,"Volvo FH"],[/scania/,2.2,2.8,"Scania"],
  [/actros/,2.3,3,"Mercedes-Benz Actros"],[/atego/,3,4,"Mercedes-Benz Atego"],[/accelo/,5.5,7.5,"Mercedes-Benz Accelo"],
  [/constellation/,2.3,3.2,"VW Constellation"],[/meteor/,2.2,2.8,"VW Meteor"],[/delivery/,4.5,6.5,"VW Delivery"],
  [/s way|stralis|hi way|hi road/,2.2,2.8,"Iveco S-Way / Stralis"],[/tector/,3,4.5,"Iveco Tector"],[/daily/,7,10,"Iveco Daily"],
  [/\bxf\b|\bdaf\b/,2.3,3,"DAF XF"],[/cargo/,2.8,5,"Ford Cargo"],[/\bhr\b/,8,11,"Hyundai HR"],[/bongo/,9,12,"Kia Bongo"]
];
function achaBase(m){var n=norm(m);for(var i=0;i<BASE.length;i++)if(BASE[i][0].test(n))return {min:BASE[i][1],max:BASE[i][2],nome:BASE[i][3]};return null}

var PROXIES=[
  function(u){return "https://api.allorigins.win/raw?url="+encodeURIComponent(u)},
  function(u){return "https://corsproxy.io/?"+encodeURIComponent(u)}
];
function getTxt(url,ms){
  var c=new AbortController(),t=setTimeout(function(){c.abort()},ms);
  return fetch(url,{signal:c.signal}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error("http");return r.text()},function(e){clearTimeout(t);throw e});
}
function buscaWeb(q){
  var alvo="https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),i=0;
  function tenta(){
    if(i>=PROXIES.length)return Promise.reject(new Error("sem acesso"));
    return getTxt(PROXIES[i++](alvo),8000).then(function(h){if(h.length<500)throw new Error("vazio");return h}).catch(tenta);
  }
  return tenta();
}
function extrai(html,modelo){
  var doc=new DOMParser().parseFromString(html,"text/html"),vals=[],fontes=[];
  var toks=norm(modelo).split(" ").filter(function(x){return x.length>=3});
  doc.querySelectorAll(".result").forEach(function(r){
    var a=r.querySelector(".result__a"),sn=r.querySelector(".result__snippet");
    var t=((a?a.textContent:"")+" "+(sn?sn.textContent:"")).toLowerCase(),tn=norm(t);
    if(!/caminh|carreta|cavalo|truck|rodovi|frete/.test(tn))return;
    if(toks.length&&!toks.some(function(k){return tn.indexOf(k)>-1}))return;
    var re=/(\d{1,2}(?:[.,]\d{1,2})?)(?:\s*(?:a|à|até|-|–|e)\s*(\d{1,2}(?:[.,]\d{1,2})?))?\s*km\s*(?:\/|por)\s*l(?:itros?)?\b/g,m,achou=false;
    while((m=re.exec(t))){
      var x=num(m[1]),y=m[2]?num(m[2]):0,v=y?(x+y)/2:x;
      if(v>=0.8&&v<=12){vals.push(v);achou=true}
    }
    if(achou&&a&&fontes.length<3){
      var h=a.getAttribute("href")||"",mm=h.match(/uddg=([^&]+)/),u=mm?decodeURIComponent(mm[1]):h;
      if(u.indexOf("https://")===0)fontes.push({t:a.textContent.trim(),u:u});
    }
  });
  return {vals:vals,fontes:fontes};
}

$("vbusca").onclick=function(){
  var m=$("vmod").value.trim(),btn=this;
  if(!m){msg("Digite o modelo do caminhão para pesquisar.");return}
  btn.disabled=true;msg("🔎 Pesquisando o consumo do <b>"+esc(m)+"</b> na internet…");
  var base=achaBase(m);
  buscaWeb(m+" caminhão consumo médio km/l").then(function(h){return extrai(h,m)}).catch(function(){return null}).then(function(r){
    var kmpl=0,txt="";
    if(r&&r.vals.length){
      var v=mediana(r.vals);
      if(!(base&&(v<base.min*0.6||v>base.max*1.6))){
        kmpl=v;
        var fs=r.fontes.map(function(f){return '<a href="'+esc(f.u)+'" target="_blank" rel="noopener noreferrer">'+esc(f.t.slice(0,60))+'</a>'}).join(" · ");
        txt="Encontrado na internet (mediana de "+r.vals.length+" "+(r.vals.length>1?"menções":"menção")+")."+(fs?"<p>Fontes: "+fs+"</p>":"");
      }
    }
    if(!kmpl&&base){
      kmpl=(base.min+base.max)/2;
      txt="Não consegui um valor confiável online. Usei a média de referência do <b>"+esc(base.nome)+"</b>: faixa de "+fn(base.min,1)+" a "+fn(base.max,1)+" km/L.";
    }
    if(!kmpl){msg("Não encontrei o consumo desse modelo. Escolha uma categoria média ou digite o consumo (km/L).");return}
    kmpl=Math.round(kmpl*10)/10;
    V.kmpl=kmpl;$("vkmpl").value=fn(kmpl,1);salvar();draw();
    msg("<b>✔ "+fn(kmpl,1)+" km/L aplicado</b> = "+fn(1/kmpl,2)+" L por km<p>"+txt+"</p><p>É uma estimativa: varia com carga, relevo e motorista. Ajuste no campo abaixo se souber o consumo real.</p>");
  }).then(function(){btn.disabled=false});
};

setInterval(function(){draw();if(V.st==="running"&&++tick%5===0)salvar()},1000);
document.addEventListener("visibilitychange",function(){
  if(document.hidden)salvar();
  else if(V.st==="running"&&!wl)wake(true);
});
window.addEventListener("pagehide",salvar);
draw();
})();