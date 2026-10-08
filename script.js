var KEY="entregas_v1",items=[];
try{items=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){items=[]}
function hoje(){return new Date().toLocaleDateString("sv-SE")}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
items.forEach(function(it){if(!it.id)it.id=uid()});
document.getElementById("data").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});

var armed=-1,tm,pos=null,last={t:0,lat:0,lon:0},dist={},pend={},gfail={},geoState="buscando",geoErr="",geoTimer=null,watchId=null;
function maps(e){return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="+encodeURIComponent(e)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(items))}catch(e){}}
function esc(s){return s.replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

/* ---------- distância ---------- */
function hav(a,b,c,d){var R=6371,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(q))}
function nominatim(q){
  return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q="+encodeURIComponent(q))
    .then(function(r){return r.json()}).then(function(j){return j&&j[0]?{lat:+j[0].lat,lon:+j[0].lon}:null});
}
function geocode(end){
  return nominatim(end).then(function(c){
    if(c)return c;
    var sem=end.replace(/,?\s*\d+[A-Za-z]?\b/,"");
    return sem!==end?nominatim(sem):null;
  });
}
var fila=Promise.resolve();
function ensureCoords(){
  items.forEach(function(it){
    if(it.lat!=null||pend[it.id])return;
    pend[it.id]=true;delete gfail[it.id];
    fila=fila.then(function(){return geocode(it.end)}).then(function(c){
      if(c){it.lat=c.lat;it.lon=c.lon;save()}else gfail[it.id]=1;
      render();calc(true);
    }).catch(function(){gfail[it.id]=1;render()}).then(function(){return new Promise(function(r){setTimeout(r,1100)})});
  });
  render();
}
function calc(force){
  if(!pos)return;
  var now=Date.now();
  if(!force&&last.t&&hav(pos.lat,pos.lon,last.lat,last.lon)*1000<300&&now-last.t<120000)return;
  var list=items.filter(function(i){return i.lat!=null});
  if(!list.length)return;
  last={t:now,lat:pos.lat,lon:pos.lon};
  list.forEach(function(i){dist[i.id]={km:hav(pos.lat,pos.lon,i.lat,i.lon),est:true}});
  render();
  var co=[pos.lon+","+pos.lat].concat(list.map(function(i){return i.lon+","+i.lat})).join(";");
  fetch("https://router.project-osrm.org/table/v1/driving/"+co+"?sources=0&annotations=distance")
    .then(function(r){return r.json()}).then(function(j){
      if(j&&j.distances&&j.distances[0]){
        list.forEach(function(i,k){var m=j.distances[0][k+1];if(m!=null)dist[i.id]={km:m/1000,est:false}});
        render();
      }
    }).catch(function(){});
}
function onPos(p){
  var first=geoState!=="ok";
  pos={lat:p.coords.latitude,lon:p.coords.longitude,t:Date.now()};
  geoState="ok";clearTimeout(geoTimer);
  calc(first);render();
}
function watch(){
  if(watchId!=null)return;
  watchId=navigator.geolocation.watchPosition(onPos,function(e){
    if(pos)return;
    geoState="erro";
    geoErr=e.code===1?"Localização bloqueada. Permita o acesso à localização nas configurações do navegador.":"Não consegui obter sua localização. Verifique se o GPS está ligado.";
    render();
  },{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
}
function startGeo(){
  if(!navigator.geolocation){geoState="erro";geoErr="Este aparelho não tem localização.";render();return}
  if(watchId!=null){navigator.geolocation.clearWatch(watchId);watchId=null}
  geoState=pos?"ok":"buscando";render();
  navigator.geolocation.getCurrentPosition(function(p){onPos(p);watch()},function(e){
    if(e.code===1){geoState="erro";geoErr="Localização bloqueada. Permita o acesso à localização nas configurações do navegador.";render()}
    else watch();
  },{enableHighAccuracy:false,maximumAge:600000,timeout:12000});
  clearTimeout(geoTimer);
  geoTimer=setTimeout(function(){
    if(geoState==="buscando"){geoState="erro";geoErr="Não consegui encontrar sua localização. Verifique se o GPS está ligado.";render()}
  },25000);
}
function fmt(d){return (d.est?"~":"")+d.km.toLocaleString("pt-BR",{maximumFractionDigits:d.km<10?1:0})+" km"}
function chip(it){
  if(gfail[it.id])return '<button class="retry" data-a="retry" data-id="'+it.id+'">⚠ Endereço não localizado · tentar de novo</button>';
  if(it.lat==null)return '<span class="km">🧭 localizando endereço…</span>';
  if(dist[it.id])return '<span class="km" title="'+(dist[it.id].est?"Distância em linha reta (estimada)":"Distância pela estrada")+'">🧭 '+fmt(dist[it.id])+'</span>';
  return '<span class="km">🧭 '+(pos?"calculando…":geoState==="erro"?"ative a localização":"aguardando localização…")+'</span>';
}

/* ---------- lista ---------- */
function render(){
  var L=document.getElementById("lista"),av=document.getElementById("aviso");
  var cls="aviso",txt,btn="";
  if(geoState==="ok"&&pos){txt="✅ Localização do motorista registrada · atualizada às "+new Date(pos.t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});cls+=" ok"}
  else if(geoState==="erro"){txt="⚠ "+geoErr;btn='<button id="ativar">Tentar de novo</button>'}
  else txt="📡 Buscando sua localização…";
  av.className=cls;av.innerHTML='<span>'+esc(txt)+'</span>'+btn;
  var bt=document.getElementById("ativar");if(bt)bt.onclick=startGeo;
  if(!items.length){L.innerHTML='<div class="empty">Nenhuma entrega ainda.<br>Toque em <b>+</b> para adicionar.</div>';return}
  L.innerHTML=items.map(function(it,i){
    var s=it.dia===hoje()?it.status:"";
    var b=s==="ok"?'<span class="badge b-ok">Concluída hoje</span>':s==="no"?'<span class="badge b-no">Não concluída</span>':"";
    return '<div class="card'+(s?" done":"")+'" data-i="'+i+'"><div class="info"><div class="nome">'+esc(it.nome)+'</div><div class="end">'+esc(it.end)+'</div><a class="rota" href="'+maps(it.end)+'" target="_blank" rel="noopener noreferrer">📍 Ver rota no Maps</a>'+chip(it)+b+'<button class="del'+(armed===i?" arm":"")+'" data-a="del" data-i="'+i+'">'+(armed===i?"Toque de novo para excluir":"🗑 Excluir")+'</button></div><div class="acts"><button class="btn ok'+(s==="no"?" off":"")+'" data-a="ok" data-i="'+i+'" aria-label="Concluída">✓</button><button class="btn no'+(s==="ok"?" off":"")+'" data-a="no" data-i="'+i+'" aria-label="Não concluída">✕</button></div></div>'
  }).join("")
}
document.getElementById("lista").addEventListener("click",function(ev){
  var r=ev.target.closest(".retry");
  if(r){ev.stopPropagation();delete pend[r.dataset.id];delete gfail[r.dataset.id];ensureCoords();return}
  var d=ev.target.closest(".del");
  if(d){ev.stopPropagation();var k=+d.dataset.i;clearTimeout(tm);
    if(armed===k){items.splice(k,1);armed=-1;save()}
    else{armed=k;tm=setTimeout(function(){armed=-1;render()},3500)}
    render();return}
  if(ev.target.closest("a"))return;
  var btn=ev.target.closest(".btn");
  if(btn){ev.stopPropagation();var i=+btn.dataset.i;items[i].status=btn.dataset.a;items[i].dia=hoje();save();render();return}
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
document.getElementById("ref").onclick=function(){var b=this;b.classList.add("spin");setTimeout(function(){b.classList.remove("spin")},900);if(pos)calc(true);else startGeo();ensureCoords()};

/* ---------- voz ---------- */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null,ativo=false,fin="",ult="",semFala=0,tSil=null,mic=document.getElementById("mic"),vs=document.getElementById("vs"),inp=document.getElementById("e");
function limpa(t){return t.replace(/\s*,?\s*v[ií]rgula\s*/gi,", ").replace(/\s+/g," ").trim()}
function parar(msg){
  ativo=false;clearTimeout(tSil);
  if(rec){try{rec.stop()}catch(e){}}
  mic.classList.remove("rec");mic.setAttribute("aria-pressed","false");
  vs.className="vs";
  vs.textContent=msg!==undefined?msg:(inp.value?"Confira o endereço e salve.":"");
}
function ouvir(){
  var r=new SR(),sf="",fatal=false;rec=r;
  r.lang="pt-BR";r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
  r.onresult=function(ev){
    var f="",it="";
    for(var i=0;i<ev.results.length;i++){var x=ev.results[i];if(x.isFinal)f+=x[0].transcript+" ";else it+=x[0].transcript}
    sf=f;ult=it;semFala=0;
    inp.value=limpa(fin+" "+f+it);
    clearTimeout(tSil);tSil=setTimeout(function(){parar()},4000);
  };
  r.onerror=function(ev){
    if(ev.error==="no-speech"||ev.error==="aborted")return;
    fatal=true;
    parar(ev.error==="not-allowed"||ev.error==="service-not-allowed"?"Permita o uso do microfone no navegador.":ev.error==="network"?"Sem internet para reconhecer a voz. Verifique a conexão.":"Erro no microfone ("+ev.error+").");
  };
  r.onend=function(){
    fin=limpa(fin+" "+(sf||ult));sf="";ult="";
    if(rec===r)rec=null;
    if(ativo&&!fatal){
      if(++semFala>3)parar("Não ouvi nada. Toque no microfone e tente de novo.");
      else setTimeout(function(){if(ativo&&!rec)ouvir()},200);
    }
  };
  try{r.start()}catch(e){parar("Não consegui iniciar o microfone.")}
}
if(!SR){mic.classList.add("hide")}
else mic.onclick=function(){
  if(ativo){parar();return}
  ativo=true;fin="";ult="";semFala=0;
  mic.classList.add("rec");mic.setAttribute("aria-pressed","true");
  vs.className="vs on";vs.textContent="Ouvindo… fale o endereço";
  ouvir();
};

document.getElementById("f").onsubmit=function(ev){
  ev.preventDefault();
  if(ativo)parar("");
  items.push({id:uid(),nome:document.getElementById("n").value.trim(),end:inp.value.trim(),status:"",dia:""});
  save();ev.target.reset();vs.textContent="";aba(1);ensureCoords();
};

document.addEventListener("visibilitychange",function(){if(!document.hidden){if(geoState!=="ok")startGeo();else calc(true)}});
render();ensureCoords();startGeo();