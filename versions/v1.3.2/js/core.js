(function(){
  'use strict';
  const Games=window.Games=window.Games||{};
  const names={splendor:'璀璨宝石',scout:'马戏星探',poker:'德州扑克',athlete:'胡闹运动会',flip7:'Flip 7',mahjong:'武穴麻将'};
  const limits={splendor:[2,4],scout:[2,5],poker:[2,10],athlete:[2,6],flip7:[3,6],mahjong:[4,4]};
  const legacyTypes=['splendor','scout','poker'];
  const emptyStats=()=>({started:0,completed:0,wins:0,activeMs:0,rankSum:0});
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||0));
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const fmtTime=ms=>{const s=Math.floor(ms/1000);return `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s%3600/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`};
  const formatMoney=n=>Number(n).toLocaleString('zh-CN');
  function playerBadge(i,ui={}){
    const seat=ui.onlineSeats?.[i];
    if(!seat)return '';
    const emote=ui.onlineEmotes?.find(x=>x.id===seat.id);
    return '<span class="online-player-badge" data-player-seat="'+i+'"><span class="online-avatar" aria-hidden="true">'+escape((seat.nick||'?').slice(0,1))+'</span>'+(emote?'<span class="online-emote-bubble" role="status">'+escape(emote.phrase)+'</span>':'')+'</span>';
  }
  function attachSlots(p){
    if(p.version===1){const old=p.active;delete p.active;p.games={splendor:null,scout:null,poker:null};p.activeType=old?old.type:null;if(old)p.games[old.type]=old;p.version=2}
    for(const k of Object.keys(names)){if(!Object.hasOwn(p.games,k))p.games[k]=null;if(!Object.hasOwn(p.stats,k))p.stats[k]=emptyStats()}
    p.version=3;
    // The active view is an alias; each game is serialized exactly once.
    Object.defineProperty(p,'active',{configurable:true,enumerable:false,get(){return this.games[this.activeType]||null},set(a){if(a){this.games[a.type]=a;this.activeType=a.type}else if(this.activeType){this.games[this.activeType]=null;this.activeType=null}}});
    return p;
  }
  function createProfile(start=2000,limit=2000){return attachSlots({version:3,createdAt:new Date().toISOString(),visual:true,wallet:start,bank:{limit,totalBorrowed:0,totalRepaid:0,outstanding:0},stats:Object.fromEntries(Object.keys(names).map(k=>[k,emptyStats()])),achievements:[],history:[],games:Object.fromEntries(Object.keys(names).map(k=>[k,null])),activeType:null})}
  function validProfile(p){
    if(!p||![1,2,3].includes(p.version)||!Number.isSafeInteger(p.wallet)||p.wallet<0||!p.bank||!['limit','totalBorrowed','totalRepaid','outstanding'].every(k=>Number.isSafeInteger(p.bank[k])&&p.bank[k]>=0)||p.bank.totalBorrowed-p.bank.totalRepaid!==p.bank.outstanding||p.bank.limit<p.bank.outstanding)return false;
    const required=p.version<3?legacyTypes:['splendor','scout','poker','athlete','flip7'],present=Object.keys(names).filter(k=>p.stats&&Object.hasOwn(p.stats,k));
    if(!p.stats||!required.every(k=>Object.hasOwn(p.stats,k))||!present.every(k=>{const s=p.stats[k];return s&&['started','completed','wins','activeMs','rankSum'].every(f=>Number.isFinite(s[f])&&s[f]>=0)}))return false;
    if(!Array.isArray(p.history)||!Array.isArray(p.achievements))return false;
    const validSlot=(a,k)=>a===null||(a&&a.type===k&&Object.hasOwn(names,a.type)&&a.game&&Number.isInteger(a.players)&&a.players>=limits[a.type][0]&&a.players<=limits[a.type][1]&&['easy','medium','hard'].includes(a.difficulty)&&Number.isFinite(a.elapsedMs)&&a.elapsedMs>=0&&typeof a.paused==='boolean');
    if(p.version===1){if(p.active&&!validSlot(p.active,p.active.type))return false}
    else if(!p.games||!required.every(k=>Object.hasOwn(p.games,k))||!Object.keys(names).filter(k=>Object.hasOwn(p.games,k)).every(k=>validSlot(p.games[k],k))||!(p.activeType===null||names[p.activeType])||(p.activeType&&!Object.hasOwn(p.games,p.activeType)))return false;
    return true;
  }
  function ranks(values,secondary){return values.map((v,i)=>1+values.reduce((n,o,j)=>n+(j!==i&&(o>v||(o===v&&secondary&&secondary[j]<secondary[i]))?1:0),0))}
  function gainAchievement(p,id){if(!p.achievements.includes(id))p.achievements.push(id)}
  window.GameCore={version:'1.3.2',Games,names,limits,escape,shuffle,clamp,sum,fmtTime,formatMoney,playerBadge,createProfile,attachSlots,validProfile,ranks,gainAchievement};
})();
