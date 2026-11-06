'use strict';
const assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto');
const {server,hub}=require('../server');
const M=require('../server/engines').Games.mahjong;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('Timed out waiting for network state');}
async function client(base,port,nick){
  const response=await fetch(base+'/api/identity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nick})});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0],identity=await response.json(),socket=net.connect(port,'127.0.0.1'),packets=[];
  let handshook=false,buffer=Buffer.alloc(0);
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    if(!handshook){const end=buffer.indexOf('\r\n\r\n');if(end<0)return;assert(buffer.subarray(0,end).toString().includes('101 Switching Protocols'));buffer=buffer.subarray(end+4);handshook=true;}
    while(buffer.length>=2){const opcode=buffer[0]&15,len=buffer[1]&127,head=len===126?4:len===127?10:2;if(buffer.length<head)break;const size=len===126?buffer.readUInt16BE(2):len===127?Number(buffer.readBigUInt64BE(2)):len;if(buffer.length<head+size)break;if(opcode===1)packets.push(JSON.parse(buffer.subarray(head,head+size).toString()));buffer=buffer.subarray(head+size);}
  });
  socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${base}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nCookie: ${cookie}\r\n\r\n`);
  await until(()=>packets.some(p=>p.type==='hello'));
  return {identity,socket,packets,state:()=>packets.filter(p=>p.type==='state').at(-1),send(value){const data=Buffer.from(JSON.stringify(value)),mask=crypto.randomBytes(4),head=data.length<126?2:4,frame=Buffer.alloc(head+4+data.length);frame[0]=0x81;frame[1]=0x80|(head===2?data.length:126);if(head===4)frame.writeUInt16BE(data.length,2);mask.copy(frame,head);for(let i=0;i<data.length;i++)frame[head+4+i]=data[i]^mask[i%4];socket.write(frame);}};
}
function choice(html){
  const buttons=[...html.matchAll(/<button\b([^>]*data-action="m-[^"]+"[^>]*)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
  return buttons.find(b=>b.action==='m-hu')||buttons.find(b=>b.action==='m-special')||buttons.find(b=>b.action==='m-gang')||buttons.find(b=>b.action==='m-peng')||buttons.find(b=>b.action==='m-claim-gang')||buttons.find(b=>b.action==='m-chi')||buttons.find(b=>b.action==='m-pass')||buttons.find(b=>b.action==='m-discard')||buttons.find(b=>b.action==='m-select');
}
async function run(){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,base=`http://127.0.0.1:${port}`,clients=[];
  try{
    for(const path of ['/mahjong.css','/js/mahjong.js','/js/mahjong-results.js'])assert.equal((await fetch(base+path)).status,200);
    for(let i=0;i<4;i++)clients.push(await client(base,port,'网络麻友'+i));
    const host=clients[0];host.send({kind:'create',type:'mahjong',seats:4,bots:false,difficulty:'medium'});await until(()=>host.state());const code=host.state().room.id;
    for(const c of clients.slice(1)){c.send({kind:'join',id:code});await until(()=>c.state());}
    for(const c of clients){c.send({kind:'ready'});await until(()=>c.state().room.members.find(m=>m.id===c.identity.id)?.ready);}
    host.send({kind:'start'});await until(()=>clients.every(c=>c.state()?.room.phase==='playing'));
    let steps=0;
    while(!hub.rooms.get(code).game.roundPending&&steps++<1400){
      const room=hub.rooms.get(code),revision=room.revision;await until(()=>clients.every(c=>c.state().room.revision===revision));
      const actor=clients.find(c=>choice(c.state().gameHtml)?.action!=='m-select'&&choice(c.state().gameHtml))||clients.find(c=>choice(c.state().gameHtml)),pick=choice(actor.state().gameHtml),{action,...data}=pick;
      const count=actor.packets.filter(p=>p.type==='state').length;actor.send({kind:action==='m-select'?'preview':'gameAction',action,data,revision});
      await until(()=>action==='m-select'?actor.packets.filter(p=>p.type==='state').length>count:hub.rooms.get(code).revision>revision||actor.packets.at(-1)?.type==='error');
      assert(!clients.some(c=>c.packets.some(p=>p.type==='error')),JSON.stringify(clients.flatMap(c=>c.packets.filter(p=>p.type==='error'))));assert(M.validate(room.game,4));
    }
    assert(hub.rooms.get(code).game.roundPending);await until(()=>clients.every(c=>c.state().mahjongResult?.ledger.length===1));
    const result=host.state().mahjongResult;assert.equal(result.totals.reduce((n,v)=>n+v,0),0);assert(clients.every(c=>JSON.stringify(c.state().mahjongResult.totals)===JSON.stringify(result.totals)));
    host.send({kind:'gameAction',action:'m-end',revision:hub.rooms.get(code).revision,data:{step:hub.rooms.get(code).game.step}});await until(()=>clients.every(c=>c.state().room.phase==='finished')||host.packets.at(-1)?.type==='error');assert(!host.packets.some(p=>p.type==='error'),JSON.stringify(host.packets.filter(p=>p.type==='error')));
    assert(clients.every(c=>c.state().mahjongResult.final));assert(!JSON.stringify(result).includes('"wall"'));
    console.log('Mahjong HTTP/WebSocket passed: static assets, four cookie identities, ready/start, '+steps+' authenticated game actions, matching zero-sum results, final settlement for all four participants.');
  }finally{for(const c of clients)c.socket.destroy();for(const room of hub.rooms.values())clearTimeout(room.timer);server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;server.close();});
