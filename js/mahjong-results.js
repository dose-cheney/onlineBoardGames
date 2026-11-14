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
  const desktopTable=window.matchMedia?.('(min-width: 761px)');
  let observedBoard, tableObserver;
  const riverGap=2, tileAspect=1.4;
  function fitRiver(across,depth,length,lines){
    return Math.min((across-riverGap*(length-1))/length,(depth-riverGap*(lines-1))/(lines*tileAspect));
  }
  function fitDesktopRiver(across,depth,count){
    let width=0;
    for(let length=1;length<=Math.min(count,10);length++){
      width=Math.max(width,fitRiver(across,depth,length,Math.ceil(count/length)));
    }
    return width;
  }
  function fitMelds(rack,limit){
    const groups=rack.querySelector('.mj-melds');
    if(!groups)return limit;
    const melds=Array.from(groups.children,meld=>{
      const style=window.getComputedStyle(meld);
      return {tiles:meld.querySelectorAll('.mj-tile').length,
        trim:meld.offsetHeight-meld.querySelector('.mj-tile').offsetHeight,
        padding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+2,
        caption:meld.querySelector('small').offsetWidth};
    });
    const rowWidth=groups.getBoundingClientRect().width;
    const style=window.getComputedStyle(groups);
    const gapX=parseFloat(style.columnGap),gapY=parseFloat(style.rowGap);
    const fits=width=>{
      let used=0,row=0,height=0;
      for(const {tiles,trim,padding,caption} of melds){
        const groupWidth=Math.max(width*tiles+tiles-1,caption+.5)+padding;
        if(groupWidth>rowWidth)return false;
        if(used&&used+gapX+groupWidth>rowWidth){height+=row+gapY;used=0;row=0;}
        used+=groupWidth+(used?gapX:0);
        row=Math.max(row,width*tileAspect+trim);
      }
      return height+row<=rack.clientHeight-1;
    };
    if(fits(limit))return limit;
    let min=0,max=limit;
    for(let i=0;i<9;i++){
      const width=(min+max)/2;
      if(fits(width))min=width;
      else max=width;
    }
    return min;
  }
  function sizeDiscards(board,zones,ownMeldSize,sideRacks,topRack){
    const wide=desktopTable?.matches;
    // A four-tile kong must fit beside the covered hand in either side seat.
    let width=29;
    if(wide&&ownMeldSize){
      const ownMeld=ownMeldSize.getBoundingClientRect();
      board.style.setProperty('--mj-own-meld-width',ownMeld.width+'px');
      board.style.setProperty('--mj-own-meld-height',ownMeld.height+'px');
      width=Math.min(36,ownMeld.width-2);
    }
    if(wide){
      const backWidth=Math.min(13,window.innerHeight*.014);
      width=Math.min(width,...sideRacks.map(rack=>(rack.clientWidth-backWidth-7-9)/4));
      for(const rack of sideRacks)width=fitMelds(rack,Math.max(0,width));
      if(topRack)width=fitMelds(topRack,Math.max(0,width));
    }
    const occupied=zones.flatMap(({zone,river,count,lines,length,sideways})=>{
      if(!count||!zone.clientWidth||!zone.clientHeight)return [];
      const across=sideways?zone.clientHeight:zone.clientWidth;
      const depth=sideways?zone.clientWidth:zone.clientHeight;
      width=Math.min(width,wide?fitDesktopRiver(across,depth,count):fitRiver(across,depth,length,lines));
      return [{river,across,count}];
    });
    // Round down so CSS flex wrapping and the size calculation agree at the boundary.
    width=Math.max(0,Math.floor(width*10)/10);
    if(wide){
      for(const {river,across,count} of occupied){
        const length=Math.max(1,Math.min(10,count,Math.floor((across+riverGap)/(width+riverGap))));
        river.style.setProperty('--river-length',length);
      }
    }
    board.style.setProperty('--mj-discard-width',width+'px');
  }
  function updateDiscardLayout(root){
    const board=root.querySelector('.mj-board');
    if(board===observedBoard)return;
    tableObserver?.disconnect();
    observedBoard=board;
    if(!board)return;
    const zones=Array.from(board.querySelectorAll('.mj-river-zone'),zone=>{
      const river=zone.querySelector('.mj-river');
      const {riverLines,riverLength}=river.dataset;
      return {zone,river,count:river.querySelectorAll('.mj-river-entry').length,lines:Number(riverLines),
        length:Number(riverLength),sideways:zone.matches('.mj-river-1,.mj-river-3')};
    });
    const ownMeldSize=board.querySelector('.mj-meld-size .mj-tile');
    const sideRacks=Array.from(board.querySelectorAll('.mj-seat-1 .mj-rack,.mj-seat-3 .mj-rack'));
    const topRack=board.querySelector('.mj-seat-2 .mj-rack');
    const update=()=>sizeDiscards(board,zones,ownMeldSize,sideRacks,topRack);
    update();
    if(window.ResizeObserver){
      tableObserver=new window.ResizeObserver(update);
      for(const {zone} of zones)tableObserver.observe(zone);
      if(ownMeldSize)tableObserver.observe(ownMeldSize);
      for(const rack of sideRacks)tableObserver.observe(rack);
      if(topRack)tableObserver.observe(topRack);
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
