(function(){
  'use strict';
  const C=window.GameCore;
  const items=[
    ['first_win','general','首胜','完成任意游戏的首次胜利'],
    ['explorer','general','三桌通行','璀璨宝石、马戏星探、德州各完成至少一场'],
    ['regular','general','桌边常客','累计完成 10 场游戏'],
    ['veteran','general','资深玩家','累计完成 50 场游戏'],
    ['triple_winner','general','全能赢家','璀璨宝石、马戏星探、德州各赢得至少一场'],
    ['discreet','general','低调玩家','在无图模式完成一场游戏'],
    ['splendor_win','splendor','商会新星','赢得一场璀璨宝石'],
    ['splendor_clean','splendor','精打细算','璀璨宝石零预留获胜'],
    ['splendor_20','splendor','繁盛商会','完成璀璨宝石时达到 20 分'],
    ['splendor_nobles','splendor','贵族之友','同一场璀璨宝石获得 2 位贵族'],
    ['splendor_colors','splendor','五色商路','同一场璀璨宝石集齐五种永久折扣'],
    ['scout_win','scout','明星团长','赢得一场马戏星探'],
    ['scout_combo','scout','压轴好戏','亲自表演至少 5 张的合法组合'],
    ['scout_round10','scout','满堂喝彩','马戏星探单轮得到至少 10 分'],
    ['scout_sweep','scout','全程领跑','完成马戏星探且每轮得分均至少并列第一'],
    ['poker_profit','poker','盈利离桌','德州离桌结算时本场净收益为正'],
    ['poker_ten_hands','poker','长桌较量','同一张德州牌桌完成 10 手'],
    ['poker_double','poker','翻倍收官','德州离桌筹码达到累计买入的两倍'],
    ['poker_comeback','poker','逆风翻盘','德州本场盈利离桌且曾低于 5 个大盲'],
    ['debt_free','poker','轻装上阵','还清全部银行欠款'],
    ['tournament_finish','poker','锦标赛初体验','完成一场德州锦标赛','tournament'],
    ['tournament_win','poker','最后的赢家','首次夺得德州锦标赛冠军','tournament'],
    ['tournament_finalist','poker','决赛席位','在 6 人及以上德州锦标赛获得前两名','tournament'],
    ['tournament_full_table','poker','满桌称王','在 9 人及以上德州锦标赛夺冠','tournament'],
    ['tournament_hard','poker','高手擂台','击败高级电脑，夺得德州锦标赛冠军','tournament'],
    ['tournament_comeback','poker','绝境加冕','曾在一手发牌前不足 5 个大盲，最终夺得锦标赛冠军','tournament'],
    ['tournament_triple','poker','筹码登峰','德州锦标赛一手结算后，筹码达到初始筹码的 3 倍','tournament'],
    ['five_tables','general','五桌漫游','五款游戏各完成至少一场'],
    ['five_wins','general','五桌冠军','五款游戏各赢得至少一场'],
    ['athlete_win','athlete','运动会冠军','赢得一场胡闹运动会'],
    ['athlete_double','athlete','双冠选手','同一场运动会取得至少两个单场冠军'],
    ['athlete_twenty','athlete','积分高手','运动会结束时累计达到 20 分'],
    ['athlete_chain','athlete','连锁好戏','自己的回合内至少触发 5 次角色能力'],
    ['flip7_win','flip7','翻牌赢家','赢得一场 Flip 7'],
    ['flip7_seven','flip7','七张奇迹','集齐七个不同数字触发 Flip 7'],
    ['flip7_rescue','flip7','绝处逢生','使用第二次机会抵消一次重复数字'],
    ['flip7_fifty','flip7','大胆收获','Flip 7 单轮取得至少 50 分']
  ].map(([id,group,title,description,mode])=>({id,group,title,description,...(mode?{mode}:{})}));
  function check(p,session=p.active){
    const added=[],grant=(id,ok)=>{if(ok&&!p.achievements.includes(id)){C.gainAchievement(p,id);added.push(id)}};
    const legacy=['splendor','scout','poker'].map(k=>p.stats[k]),stats=Object.values(p.stats),completed=stats.reduce((n,s)=>n+s.completed,0);
    grant('first_win',stats.some(s=>s.wins>0));grant('explorer',legacy.every(s=>s.completed>0));
    grant('regular',completed>=10);grant('veteran',completed>=50);grant('triple_winner',legacy.every(s=>s.wins>0));
    const originalFive=['splendor','scout','poker','athlete','flip7'].map(k=>p.stats[k]);
    grant('five_tables',originalFive.every(s=>s.completed>0));grant('five_wins',originalFive.every(s=>s.wins>0));
    grant('splendor_win',p.stats.splendor.wins>0);grant('scout_win',p.stats.scout.wins>0);
    grant('debt_free',p.bank.totalBorrowed>0&&p.bank.outstanding===0);
    const tournamentResult=r=>{
      if(!Number.isInteger(r.rank)||r.rank<1)return;
      const champion=r.rank===1;
      grant('tournament_finish',true);grant('tournament_win',champion);
      grant('tournament_finalist',r.players>=6&&r.rank<=2);
      grant('tournament_full_table',champion&&r.players>=9);grant('tournament_hard',champion&&r.difficulty==='hard');
      grant('tournament_comeback',champion&&r.lowStack===true);
      grant('tournament_triple',r.buyin>0&&r.peakStack>=r.buyin*3);
    };
    p.history.filter(r=>r.type==='poker'&&r.mode==='tournament').forEach(tournamentResult);
    if(!session)return added;
    const g=session.game,finished=g.finished===true||session.completedWithRank===true,win=finished&&g.ranks&&g.ranks[0]===1;
    grant('discreet',finished&&!p.visual);
    if(session.type==='splendor'){
      const me=g.players[0];grant('splendor_clean',win&&g.reserveCount===0);
      grant('splendor_20',finished&&C.Games.splendor.points(me)>=20);grant('splendor_nobles',me.nobles.length>=2);
      grant('splendor_colors',new Set(me.cards.map(id=>C.Games.splendor.cards[id].bonus)).size===5);
    }else if(session.type==='scout'){
      grant('scout_combo',(g.maxHumanCombo||0)>=5);
      grant('scout_round10',g.roundScores.some(scores=>scores[0]>=10));
      grant('scout_sweep',finished&&g.roundScores.length===g.n&&g.roundScores.every(scores=>scores.every(v=>scores[0]>=v)));
    }else if(session.type==='athlete'){
      grant('athlete_win',win);grant('athlete_double',g.humanWins>=2);
      grant('athlete_twenty',finished&&g.totals[0]>=20);grant('athlete_chain',(g.humanBestChain||0)>=5);
    }else if(session.type==='flip7'){
      grant('flip7_win',win);grant('flip7_seven',g.humanFlip7>0);
      grant('flip7_rescue',g.humanRescues>0);grant('flip7_fifty',g.humanBestRound>=50);
    }else if(session.type==='poker'){
      const me=g.players[0],profit=me.stack-me.buyins;
      const cash=g.mode!=='tournament';
      grant('poker_profit',cash&&finished&&profit>0);grant('poker_ten_hands',g.handCount>=10);
      grant('poker_double',cash&&finished&&me.buyins>0&&me.stack>=me.buyins*2);grant('poker_comeback',cash&&finished&&profit>0&&g.hadLowStack);
      if(!cash){
        const peakStack=Math.max(g.tournamentPeakStack||g.buyin,g.betweenHands?me.stack:me.handStartStack||g.buyin);
        grant('tournament_triple',g.handCount>0&&peakStack>=g.buyin*3);
        if(finished)tournamentResult({rank:g.ranks?g.ranks[0]:me.place,players:g.n,difficulty:session.difficulty,buyin:g.buyin,peakStack,lowStack:g.tournamentLowStack===true||me.handStartStack>0&&me.handStartStack<g.big*5});
      }
    }
    return added;
  }
  function progress(p,id){
    if(id.startsWith('tournament_')){
      const g=p.games&&p.games.poker&&p.games.poker.game;
      if(g&&g.mode==='tournament'){
        const me=g.players[0],peak=Math.max(g.tournamentPeakStack||g.buyin,g.betweenHands?me.stack:me.handStartStack||g.buyin);
        if(id==='tournament_triple')return '本场最高 '+C.formatMoney(peak)+' / '+C.formatMoney(g.buyin*3)+' 筹码';
        if(id==='tournament_comeback'&&(g.tournamentLowStack||me.handStartStack>0&&me.handStartStack<g.big*5))return '短筹码经历已达成，等待夺冠';
      }
    }
    if(['explorer','triple_winner'].includes(id)){const field=id==='explorer'?'completed':'wins';return ['splendor','scout','poker'].map(k=>p.stats[k]).filter(s=>s[field]>0).length+' / 3 款'}
    if(['five_tables','five_wins'].includes(id)){const field=id==='five_tables'?'completed':'wins';return ['splendor','scout','poker','athlete','flip7'].filter(k=>p.stats[k][field]>0).length+' / 5 款'}
    if(['regular','veteran'].includes(id))return Math.min(id==='regular'?10:50,Object.values(p.stats).reduce((n,s)=>n+s.completed,0))+' / '+(id==='regular'?10:50)+' 场';
    return '';
  }
  C.Achievements={items,check,progress};
})();
