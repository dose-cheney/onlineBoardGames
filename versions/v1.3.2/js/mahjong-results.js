(function () {
  'use strict';
  const key='tablecorner-mahjong-results-v1';
  const memory=new Map();
  const valid=r=>r&&r.kind==='tablecorner-mahjong-result'&&r.version===1&&typeof r.sessionId==='string'&&Number.isFinite(r.startedAt)&&Array.isArray(r.totals)&&r.totals.length===4&&r.totals.every(Number.isSafeInteger)&&Array.isArray(r.participants)&&r.participants.length===4&&r.participants.every(n=>typeof n==='string')&&Array.isArray(r.ledger);
  function read(){let stored=[];try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(data))stored=data.filter(valid);}catch{}return [...memory.values(),...stored.filter(r=>!memory.has(r.sessionId))].sort((a,b)=>b.startedAt-a.startedAt).slice(0,30);}
  function save(result){if(!valid(result)||!result.ledger.length)return false;const all=read(),old=all.find(r=>r.sessionId===result.sessionId);if(old&&(old.ledger.length>result.ledger.length||old.final&&!result.final))return true;memory.set(result.sessionId,result);try{localStorage.setItem(key,JSON.stringify([result,...all.filter(r=>r.sessionId!==result.sessionId)].slice(0,30)));return true;}catch{return false;}}
  function download(result){const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='武穴麻将-本场结果-'+new Date(result.startedAt).toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(){const all=read();return all.length?'<details class="panel mj-result-cache" data-detail-id="mahjong-results"><summary>武穴麻将 · 本机保存的场次结果（'+all.length+'）</summary>'+all.map(r=>'<article><strong>'+esc(new Date(r.startedAt).toLocaleString('zh-CN'))+' · '+(r.final?'已结束':'截至第 '+r.ledger.length+' 局的快照')+'</strong><p>'+r.participants.map((name,i)=>esc(name)+' '+(r.totals[i]/100).toLocaleString('zh-CN')+'元').join(' · ')+'</p><button data-mj-export="'+esc(r.sessionId)+'">下载本场结果</button></article>').join('')+'</details>':'';}
  window.MahjongResults={read,save,download,html};
  document.addEventListener('click',event=>{const el=event.target.closest('[data-mj-export]');if(!el)return;const result=read().find(r=>r.sessionId===el.dataset.mjExport);if(result)download(result);});
})();
