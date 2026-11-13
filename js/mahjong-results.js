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
  const desktop=window.matchMedia?.('(min-width: 901px)');
  let observedBoard, riverObserver;
  function sizeDiscards(board, zones){
    // Fit the most crowded occupied river, then use that size for all four seats.
    let width=29;
    const gap=2, aspect=1.4;
    for(const {zone,lines,length,sideways} of zones){
      if(!lines||!length||!zone.clientWidth||!zone.clientHeight)continue;
      const across=sideways?zone.clientHeight:zone.clientWidth;
      const depth=sideways?zone.clientWidth:zone.clientHeight;
      width=Math.min(width,(across-gap*(length-1))/length,(depth-gap*(lines-1))/(lines*aspect));
    }
    board.style.setProperty('--mj-discard-width',Math.max(0,Math.floor(width*10)/10)+'px');
  }
  function updateDiscardLayout(root){
    const board=root.querySelector('.mj-board');
    if(board===observedBoard)return;
    riverObserver?.disconnect();
    observedBoard=board;
    if(!board)return;
    const zones=Array.from(board.querySelectorAll('.mj-river-zone'),zone=>{
      const {riverLines,riverLength}=zone.querySelector('.mj-river').dataset;
      return {zone,lines:Number(riverLines),length:Number(riverLength),sideways:zone.matches('.mj-river-1,.mj-river-3')};
    });
    const update=()=>sizeDiscards(board,zones);
    update();
    if(window.ResizeObserver){
      riverObserver=new window.ResizeObserver(update);
      for(const {zone} of zones)riverObserver.observe(zone);
    }
  }
  function captureScroll(root){
    const visible=Array.from(root.querySelectorAll('[data-mj-scroll]')).filter(el=>el.clientHeight>0);
    return new Map(visible.map(el=>[
      el.dataset.mjScroll,
      {top:el.scrollTop,follow:el.hasAttribute('data-mj-follow')&&el.scrollHeight-el.clientHeight-el.scrollTop<8}
    ]));
  }
  function restoreTableView(root, details, scroll){
    updateDiscardLayout(root);
    for(const el of root.querySelectorAll('[data-mj-desktop-open]')) {
      if(!details.has(el.dataset.detailId))el.open=!!desktop?.matches;
    }
    for(const el of root.querySelectorAll('[data-mj-scroll]')) {
      const previous=scroll.get(el.dataset.mjScroll);
      if(previous?.follow||(!previous&&el.hasAttribute('data-mj-follow')))el.scrollTop=el.scrollHeight;
      else if(previous)el.scrollTop=previous.top;
      if(el.clientHeight>0)el.dataset.mjScrollReady='';
    }
  }
  desktop?.addEventListener('change',()=>{
    restoreTableView(document,new Map(),new Map());
  });
  document.addEventListener('toggle',event=>{
    const details=event.target;
    if(!details.open||!details.matches('.mj-action-log details'))return;
    const log=details.querySelector('[data-mj-follow]:not([data-mj-scroll-ready])');
    if(log){log.scrollTop=log.scrollHeight;log.dataset.mjScrollReady='';}
  },true);
  window.MahjongResults={read,save,download,html,captureScroll,restoreTableView};
  document.addEventListener('click',event=>{const el=event.target.closest('[data-mj-export]');if(!el)return;const result=read().find(r=>r.sessionId===el.dataset.mjExport);if(result)download(result);});
})();
