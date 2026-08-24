// tani: TV+ program alan bicimleri
'use strict';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const KOK='https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/';
function damga(d){const p=n=>String(n).padStart(2,'0');return d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds());}
async function calistir(){
  const a=await fetch(KOK+'Authenticate',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':UA},
    body:JSON.stringify({terminaltype:'webtv',terminalvendor:'5.0',osversion:'Win32',userType:'3',utcEnable:'1',timezone:'Europe/Istanbul'}),signal:AbortSignal.timeout(30000)});
  const setC=a.headers.getSetCookie?a.headers.getSetCookie():[];
  const cerez=setC.map(c=>c.split(';')[0]).join('; ');
  await a.text();
  const bugun=new Date();
  const bas=damga(new Date(Date.UTC(bugun.getUTCFullYear(),bugun.getUTCMonth(),bugun.getUTCDate())));
  const bit=damga(new Date(bugun.getTime()+2*86400000));
  const y=await fetch(KOK+'PlayBillList',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':UA,Cookie:cerez},
    body:JSON.stringify({type:'2',channelid:'31',begintime:bas,endtime:bit,isFillProgram:1}),signal:AbortSignal.timeout(30000)});
  const j=await y.json();
  const lst=j.playbilllist||j.playbillList||[];
  console.log('program sayisi:', lst.length);
  console.log('begintime gonderilen:', bas, '-> bitis:', bit);
  if(lst.length){
    const p=lst[0];
    console.log('ALANLAR:', JSON.stringify(Object.keys(p)));
    console.log('name:', JSON.stringify(p.name));
    console.log('starttime:', JSON.stringify(p.starttime));
    console.log('endtime:', JSON.stringify(p.endtime));
    console.log('introduce ilk80:', JSON.stringify(String(p.introduce||'').slice(0,80)));
    console.log('');
    console.log('ilk 8 program adi + saat:');
    for(const x of lst.slice(0,8)) console.log('   ', JSON.stringify(x.starttime), '|', String(x.name||'').slice(0,70));
  }
}
calistir().catch(e=>{console.error(e);process.exit(1);});
