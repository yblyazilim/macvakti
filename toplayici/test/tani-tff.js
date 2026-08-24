// tani-yayin.js - Turkcell TV+ program listesi tanisi.
'use strict';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const KOK='https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/';

function damga(d){const p=n=>String(n).padStart(2,'0');return d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds());}

async function calistir(){
  console.log('=== TV+ OTURUM ===');
  const a=await fetch(KOK+'Authenticate',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':UA},
    body:JSON.stringify({terminaltype:'webtv',terminalvendor:'5.0',osversion:'Win32',userType:'3',utcEnable:'1',timezone:'Europe/Istanbul'}),
    signal:AbortSignal.timeout(30000)});
  const setC = a.headers.getSetCookie ? a.headers.getSetCookie() : [];
  const cerez = setC.map(c=>c.split(';')[0]).join('; ');
  console.log('  http:', a.status, '| set-cookie adedi:', setC.length, '| cerez uzunluk:', cerez.length);
  const authGovde = await a.text();
  console.log('  govde ilk 120:', authGovde.slice(0,120).replace(/\s+/g,' '));

  console.log('');
  console.log('=== PLAYBILLLIST ===');
  const bugun=new Date();
  const bas=damga(new Date(Date.UTC(bugun.getUTCFullYear(),bugun.getUTCMonth(),bugun.getUTCDate())));
  const bit=damga(new Date(bugun.getTime()+2*86400000));
  for (const [id,ad] of Object.entries({'31':'TRT Spor','11':'S Sport','4399':'tabii spor','3':'A Spor'})) {
    try{
      const y=await fetch(KOK+'PlayBillList',{method:'POST',
        headers:{'Content-Type':'application/json','User-Agent':UA,Cookie:cerez},
        body:JSON.stringify({type:'2',channelid:id,begintime:bas,endtime:bit,isFillProgram:1}),
        signal:AbortSignal.timeout(30000)});
      const t=await y.text();
      let adet=null, anahtarlar=null;
      try{const j=JSON.parse(t); adet=(j.playbilllist||j.playbillList||[]).length; anahtarlar=Object.keys(j).slice(0,6);}catch(_){ }
      console.log('  '+ad+': http='+y.status+' bayt='+t.length+' program='+adet+' anahtar='+JSON.stringify(anahtarlar));
      if(adet===0||adet===null) console.log('     ilk200: '+t.slice(0,200).replace(/\s+/g,' '));
    }catch(e){ console.log('  '+ad+': HATA '+String(e.message||e).slice(0,120)); }
  }
}
calistir().catch(e=>{console.error(e);process.exit(1);});
