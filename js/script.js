var KEY="entregas_v1",items=[];
try{items=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){items=[]}
function hoje(){return new Date().toLocaleDateString("sv-SE")}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
items.forEach(function(it){if(!it.id)it.id=uid()});
document.getElementById("data").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});

var armed=-1,tm,etm,pos=null,last={t:0,lat:0,lon:0},dist={},pend={},gfail={},geoState="buscando",geoErr="",geoTimer=null,watchId=null,gSeq=0,GV=2,MAXROTAS=12,gNota="Rotas de carro · dados do OpenStreetMap";
items.forEach(function(it){if(it.gv!==GV){delete it.lat;delete it.lon}});
function maps(e){return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="+encodeURIComponent(e)}
function mapsIt(it){return maps(it.src==="coord"?it.lat+","+it.lon:it.end)}
var TRASH='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
function save(){try{localStorage.setItem(KEY,JSON.stringify(items))}catch(e){}}
function esc(s){return s.replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

/* ---------- distância (100% gratuito: ViaCEP, Nominatim, Photon, BrasilAPI e OSRM) ---------- */
function hav(a,b,c,d){var R=6371,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(q))}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function jget(url){
  var c=new AbortController(),t=setTimeout(function(){c.abort()},10000);
  return fetch(url,{signal:c.signal}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error("http "+r.status);return r.json()},function(e){clearTimeout(t);throw e});
}
/* aceita coordenadas ou link do Google Maps colado no campo de endereço */
function achaCoord(s){
  var t=s;try{t=decodeURIComponent(s)}catch(e){}
  var m=t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||t.match(/(-?\d{1,2}\.\d{3,})\s*[,;\/]?\s*(-?\d{1,3}\.\d{3,})/);
  if(!m)return null;
  var la=+m[1],lo=+m[2];
  return (Math.abs(la)<=90&&Math.abs(lo)<=180)?[la,lo]:null;
}
function normEnd(s){
  s=s.replace(/\s+/g," ").trim();
  s=s.replace(/(^|,\s*)R\.?\s+(?=\S)/gi,"$1Rua ").replace(/\bAv\.?\s+/gi,"Avenida ").replace(/\bTrav\.?\s+/gi,"Travessa ")
     .replace(/(^|,\s*)Al\.?\s+(?=[A-Za-zÀ-ú])/gi,"$1Alameda ").replace(/\bEstr\.?\s+/gi,"Estrada ").replace(/\bRod\.?\s+/gi,"Rodovia ")
     .replace(/\bP[çc]a\.?\s+/gi,"Praça ").replace(/\bJd\.?\s+/gi,"Jardim ").replace(/\bVl\.?\s+/gi,"Vila ").replace(/\bPq\.?\s+/gi,"Parque ");
  s=s.replace(/\bs\/n\b/gi,"").replace(/\b(?:n[º°]|nr|n[úu]mero|no|n)\.?\s*(?=\d)/gi,"");
  s=s.replace(/[,\-–]?\s*\b(?:apto?|apartamento|bloco|bl|sala|andar|loja)\.?\s*(?:\d+[A-Za-z]?|[A-Za-z]\b)/gi,"");
  s=s.replace(/\s+[-–]\s+/g,", ").replace(/\s*,\s*/g,", ").replace(/(,\s*)+/g,", ").replace(/^[,\s]+|[,\s]+$/g,"");
  return s;
}
function achaNum(s){
  var re=/(^|[\s,])(\d{1,5}[A-Za-z]?)(?=\s|,|$)(?!\s+de\s)/g,m,ult=null,virg=null;
  while((m=re.exec(s))){
    var ini=m.index+m[1].length;
    if(/\bkm\s*$/i.test(s.slice(0,ini)))continue;
    ult={n:m[2],i:ini};
    if(!virg&&/,\s*$/.test(s.slice(0,ini)))virg=ult;
  }
  return virg||ult;
}
function variantes(end){
  var e=normEnd(end),mc=end.match(/\b\d{5}-?\d{3}\b/),cep=mc?mc[0].replace("-",""):null;
  var semCep=e.replace(/\b\d{5}-?\d{3}\b/,"").replace(/(,\s*)+/g,", ").replace(/^[,\s]+|[,\s]+$/g,"");
  var n=achaNum(semCep),semNum=semCep;
  if(n)semNum=(semCep.slice(0,n.i)+semCep.slice(n.i+n.n.length)).replace(/\s+/g," ").replace(/(,\s*)+/g,", ").replace(/^[,\s]+|[,\s]+$/g,"");
  return {q1:semCep+", Brasil",q2:semNum+", Brasil",cep:cep,num:n?n.n:null};
}
var CIDADE_ADMIN=/^(city|town|village|municipality|state|country|region|county|state_district|island|hamlet)$/;
var BAIRRO=/^(suburb|neighbourhood|quarter|city_district|borough|residential)$/;
function nomi(q,forca){
  var u="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=br&accept-language=pt-BR&q="+encodeURIComponent(q);
  if(pos)u+="&viewbox="+(pos.lon-1.5)+","+(pos.lat+1.5)+","+(pos.lon+1.5)+","+(pos.lat-1.5);
  return jget(u).then(function(j){
    var r=j&&j[0];if(!r)return null;
    var t=r.addresstype||r.type||"";
    if(CIDADE_ADMIN.test(t))return null;
    var prec=forca||((r.address&&r.address.house_number)?"exato":BAIRRO.test(t)?"bairro":"rua");
    return {lat:+r.lat,lon:+r.lon,prec:prec,src:"osm"};
  }).catch(function(){return null});
}
function photon(q,forca){
  var u="https://photon.komoot.io/api/?limit=1&q="+encodeURIComponent(q);
  if(pos)u+="&lat="+pos.lat+"&lon="+pos.lon;
  return jget(u).then(function(j){
    var f=j&&j.features&&j.features[0],p=f&&f.properties;
    if(!p||p.countrycode!=="BR")return null;
    var ok=p.street||p.housenumber||/^(highway|building|amenity|shop|office|tourism|leisure|craft|industrial|landuse)$/.test(p.osm_key||"");
    if(!ok)return null;
    var c=f.geometry.coordinates;
    return {lat:c[1],lon:c[0],prec:forca||(p.housenumber?"exato":"rua"),src:"osm"};
  }).catch(function(){return null});
}
function viaCep(cep){
  if(!cep)return Promise.resolve(null);
  return jget("https://viacep.com.br/ws/"+cep+"/json/").then(function(j){return j&&!j.erro&&j.logradouro?j:null}).catch(function(){return null});
}
function brasilCep(cep){
  if(!cep)return Promise.resolve(null);
  return jget("https://brasilapi.com.br/api/cep/v2/"+cep).then(function(j){
    var c=j&&j.location&&j.location.coordinates,la=c&&parseFloat(c.latitude),lo=c&&parseFloat(c.longitude);
    return isFinite(la)&&isFinite(lo)?{lat:la,lon:lo,prec:"rua",src:"cep"}:null;
  }).catch(function(){return null});
}
var RANK={exato:3,rua:2,bairro:1};
function rodar(passos){
  var melhor=null,i=0;
  function prox(){
    if(i>=passos.length)return Promise.resolve(melhor);
    var f=passos[i++];
    return sleep(i>1?1100:0).then(f).then(function(r){
      if(r){
        if(r.prec==="exato")return r;
        if(!melhor||RANK[r.prec]>RANK[melhor.prec])melhor=r;
      }
      return prox();
    });
  }
  return prox();
}
function geocode(end){
  var cd=achaCoord(end);
  if(cd)return Promise.resolve({lat:cd[0],lon:cd[1],prec:"exato",src:"coord"});
  var v=variantes(end);
  return viaCep(v.cep).then(function(vc){
    var p1=[];
    if(vc){
      var vq=vc.logradouro+(v.num?", "+v.num:"")+", "+vc.localidade+" - "+vc.uf+", Brasil";
      p1.push(function(){return nomi(vq)},function(){return photon(vq)});
    }
    p1.push(function(){return nomi(v.q1)},function(){return photon(v.q1)});
    return rodar(p1).then(function(r){
      if(r&&r.prec!=="bairro")return r;
      var p2=[];
      if(vc)p2.push(function(){return nomi(vc.logradouro+", "+vc.bairro+", "+vc.localidade+" - "+vc.uf+", Brasil","rua")});
      if(v.q2!==v.q1){p2.push(function(){return nomi(v.q2,"rua")},function(){return photon(v.q2,"rua")})}
      if(v.cep)p2.push(function(){return brasilCep(v.cep)});
      return rodar(p2).then(function(r2){return r2||r});
    });
  });
}
var fila=Promise.resolve();
function ensureCoords(){
  if(!pos&&geoState==="buscando"){clearTimeout(etm);etm=setTimeout(ensureCoords,3000);render();return}
  items.forEach(function(it){
    if(it.lat!=null||pend[it.id])return;
    pend[it.id]=true;delete gfail[it.id];
    fila=fila.then(function(){return geocode(it.end)}).then(function(c){
      if(c){it.lat=c.lat;it.lon=c.lon;it.prec=c.prec;it.src=c.src;it.gv=GV;save()}else gfail[it.id]=1;
      render();calc(true);
    }).catch(function(){gfail[it.id]=1;render()}).then(function(){return sleep(1100)});
  });
  render();
}
var ROTAS=["https://router.project-osrm.org/route/v1/driving/","https://routing.openstreetmap.de/routed-car/route/v1/driving/"];
function rota(a,b){
  var p=a.lon+","+a.lat+";"+b.lon+","+b.lat+"?overview=false";
  function tenta(i){
    if(i>=ROTAS.length)return Promise.reject(new Error("rota"));
    return jget(ROTAS[i]+p).then(function(j){
      if(j&&j.routes&&j.routes[0]&&typeof j.routes[0].distance==="number")return j.routes[0].distance;
      throw new Error("sem rota");
    }).catch(function(){return tenta(i+1)});
  }
  return tenta(0);
}
function pendentes(){return items.filter(function(i){return !(i.dia===hoje()&&i.status)})}
function calc(force){
  if(!pos)return;
  var now=Date.now();
  if(!force&&last.t&&hav(pos.lat,pos.lon,last.lat,last.lon)*1000<300&&now-last.t<90000)return;
  var list=pendentes().filter(function(i){return i.lat!=null});
  if(!list.length)return;
  last={t:now,lat:pos.lat,lon:pos.lon};
  var seq=++gSeq,o={lat:pos.lat,lon:pos.lon};
  list.forEach(function(i){if(!dist[i.id])dist[i.id]={km:hav(o.lat,o.lon,i.lat,i.lon),est:true,aprox:i.prec!=="exato"}});
  render();
  list.map(function(i){return {i:i,h:hav(o.lat,o.lon,i.lat,i.lon)}}).sort(function(a,b){return a.h-b.h}).slice(0,MAXROTAS).reduce(function(p,x){
    return p.then(function(){
      if(seq!==gSeq)return;
      return rota(o,{lat:x.i.lat,lon:x.i.lon}).then(function(m){
        if(seq!==gSeq)return;
        dist[x.i.id]={km:m/1000,est:false,aprox:x.i.prec!=="exato"};render();
      }).catch(function(){}).then(function(){return sleep(250)});
    });
  },Promise.resolve());
}
function onPos(p){
  if(window.tripFeed)tripFeed(p);
  var first=geoState!=="ok";
  pos={lat:p.coords.latitude,lon:p.coords.longitude,t:Date.now()};
  geoState="ok";clearTimeout(geoTimer);
  if(first)ensureCoords();
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
function fmt(d){return (d.est||d.aprox?"~":"")+d.km.toLocaleString("pt-BR",{maximumFractionDigits:d.km<10?1:0})+" km"}
function chip(it){
  if(it.dia===hoje()&&it.status)return "";
  if(gfail[it.id])return '<button class="retry" data-a="retry" data-id="'+it.id+'" title="Dica: acrescente bairro e cidade, ou cole as coordenadas (ex.: -5.7945, -35.2110)">⚠ Endereço não localizado · tentar de novo</button>';
  var d=dist[it.id];
  if(d)return '<span class="km" title="'+(d.est?"Distância em linha reta (estimada)":d.aprox?"Endereço localizado só até a rua/bairro: distância aproximada":"Distância pela rota de carro")+'">🧭 '+fmt(d)+'</span>';
  if(it.lat==null)return '<span class="km">🧭 localizando endereço…</span>';
  return '<span class="km">🧭 '+(pos?"calculando…":geoState==="erro"?"ative a localização":"aguardando localização…")+'</span>';
}

/* ---------- lista ---------- */
function render(){
  var L=document.getElementById("lista"),av=document.getElementById("aviso");
  var cls="aviso",txt,btn="";
  if(geoState==="ok"&&pos){txt="✅ Localização do motorista registrada · atualizada às "+new Date(pos.t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});cls+=" ok"}
  else if(geoState==="erro"){txt="⚠ "+geoErr;btn='<button id="ativar">Tentar de novo</button>'}
  else txt="📡 Buscando sua localização…";
  av.className=cls;av.innerHTML='<span>'+esc(txt)+(gNota?'<br><small>'+esc(gNota)+'</small>':'')+'</span>'+btn;
  var bt=document.getElementById("ativar");if(bt)bt.onclick=startGeo;
  if(!items.length){L.innerHTML='<div class="empty">Nenhuma entrega ainda.<br>Toque em <b>+</b> para adicionar.</div>';return}
  L.innerHTML=items.map(function(it,i){
    var s=it.dia===hoje()?it.status:"";
    var b=s==="ok"?'<span class="badge b-ok">Concluída hoje</span>':s==="no"?'<span class="badge b-no">Não concluída</span>':"";
    return '<div class="card'+(s?" done":"")+'" data-i="'+i+'"><div class="info"><div class="nome">'+esc(it.nome)+'</div><div class="end">'+esc(it.end)+'</div><a class="rota" href="'+mapsIt(it)+'" target="_blank" rel="noopener noreferrer">📍 Ver rota no Maps</a>'+chip(it)+b+'<button class="del'+(armed===i?" arm":"")+'" data-a="del" data-i="'+i+'">'+(armed===i?"Toque de novo para excluir":TRASH+" Excluir")+'</button></div><div class="acts"><button class="btn ok'+(s==="no"?" off":"")+'" data-a="ok" data-i="'+i+'" aria-label="Concluída">✓</button><button class="btn no'+(s==="ok"?" off":"")+'" data-a="no" data-i="'+i+'" aria-label="Não concluída">✕</button></div></div>'
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
  if(c){var a=document.createElement("a");a.href=mapsIt(items[+c.dataset.i]);a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove()}
});
function aba(n){
  ["lista","novo","viagem"].forEach(function(id,i){document.getElementById(id).classList.toggle("hide",n!==i+1)});
  ["t1","t2","t3"].forEach(function(id,i){document.getElementById(id).classList.toggle("on",n===i+1)});
  document.getElementById("fab").classList.toggle("hide",n!==1);
}
document.getElementById("t1").onclick=function(){aba(1)};
document.getElementById("t2").onclick=function(){aba(2)};
document.getElementById("fab").onclick=function(){aba(2)};
document.getElementById("t3").onclick=function(){aba(3)};
document.getElementById("ref").onclick=function(){var b=this;b.classList.add("spin");setTimeout(function(){b.classList.remove("spin")},900);items.forEach(function(i){if(i.lat==null){delete pend[i.id];delete gfail[i.id]}});if(pos)calc(true);else startGeo();ensureCoords()};

/* ---------- voz ---------- */
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null,ativo=false,fin="",ult="",semFala=0,tSil=null,redeTent=0,mic=document.getElementById("mic"),vs=document.getElementById("vs"),inp=document.getElementById("e");
var MSG_REDE="Não consegui acessar o serviço de voz. Verifique a internet (desligue VPN ou bloqueador), use o Google Chrome, ou toque no 🎤 do teclado do celular para ditar.";
function limpa(t){return t.replace(/\s*,?\s*v[ií]rgula\s*/gi,", ").replace(/\s+/g," ").trim()}
function amb(){
  var u=navigator.userAgent;
  if(navigator.brave)return "brave";
  if(/FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)|MicroMessenger|Snapchat|TikTok/i.test(u))return "app";
  return "";
}
function parar(msg,erro){
  ativo=false;clearTimeout(tSil);
  if(rec){try{rec.stop()}catch(e){}}
  mic.classList.remove("rec");mic.setAttribute("aria-pressed","false");
  vs.className="vs"+(erro?" err":"");
  vs.textContent=msg!==undefined?msg:(inp.value?"Confira o endereço e salve.":"");
  if(erro)inp.focus();
}
function ouvir(local){
  var r=new SR(),sf="",fatal=false;rec=r;
  r.lang="pt-BR";r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
  if(local){try{if("processLocally" in r)r.processLocally=true}catch(e){}}
  r.onresult=function(ev){
    var f="",it="";
    for(var i=0;i<ev.results.length;i++){var x=ev.results[i];if(x.isFinal)f+=x[0].transcript+" ";else it+=x[0].transcript}
    sf=f;ult=it;semFala=0;redeTent=0;
    inp.value=limpa(fin+" "+f+it);
    clearTimeout(tSil);tSil=setTimeout(function(){parar()},4000);
  };
  r.onerror=function(ev){
    var e=ev.error;
    if(e==="no-speech"||e==="aborted")return;
    fatal=true;
    if(e==="network"||e==="language-not-supported"){
      if(redeTent===0){redeTent=1;vs.textContent="Reconectando…";setTimeout(function(){if(ativo)ouvir(false)},800);return}
      if(redeTent===1&&"processLocally" in SR.prototype){redeTent=2;setTimeout(function(){if(ativo)ouvir(true)},800);return}
      parar(MSG_REDE,true);return;
    }
    parar((e==="not-allowed"||e==="service-not-allowed")?"Permita o microfone para este site nas configurações do navegador (no iPhone, ative também o Ditado em Ajustes > Geral > Teclado).":"Erro no microfone ("+e+"). Use o 🎤 do teclado do celular para ditar.",true);
  };
  r.onend=function(){
    fin=limpa(fin+" "+(sf||ult));sf="";ult="";
    if(rec===r)rec=null;
    if(ativo&&!fatal){
      if(++semFala>3)parar("Não ouvi nada. Toque no microfone e tente de novo.");
      else setTimeout(function(){if(ativo&&!rec)ouvir(false)},200);
    }
  };
  try{r.start()}catch(e){parar("Não consegui iniciar o microfone.",true)}
}
if(!SR){mic.classList.add("hide")}
else mic.onclick=function(){
  if(ativo){parar();return}
  var a=amb();
  if(a==="brave"){parar("O Brave bloqueia o reconhecimento de voz. Abra o site no Google Chrome ou use o 🎤 do teclado do celular.",true);return}
  if(a==="app"){parar("Navegadores dentro de apps (WhatsApp, Instagram…) não permitem voz. Abra o link no Chrome ou Safari, ou use o 🎤 do teclado do celular.",true);return}
  ativo=true;fin="";ult="";semFala=0;redeTent=0;
  mic.classList.add("rec");mic.setAttribute("aria-pressed","true");
  vs.className="vs on";vs.textContent="Ouvindo… fale o endereço";
  ouvir(false);
};

document.getElementById("f").onsubmit=function(ev){
  ev.preventDefault();
  if(ativo)parar("");
  items.push({id:uid(),nome:document.getElementById("n").value.trim(),end:inp.value.trim(),status:"",dia:""});
  save();ev.target.reset();vs.textContent="";aba(1);ensureCoords();
};

document.addEventListener("visibilitychange",function(){if(!document.hidden){if(geoState!=="ok")startGeo();else calc(true)}});
function aplicaTema(t){
  document.documentElement.setAttribute("data-theme",t);
  var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#FEFEFC":"#51504F");
  try{localStorage.setItem("tema",t)}catch(e){}
}
document.getElementById("tema").onclick=function(){aplicaTema(document.documentElement.getAttribute("data-theme")==="light"?"dark":"light")};
aplicaTema(document.documentElement.getAttribute("data-theme")==="light"?"light":"dark");
render();ensureCoords();startGeo();