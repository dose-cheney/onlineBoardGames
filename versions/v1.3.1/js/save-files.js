(function(){
  'use strict';
  const C=window.GameCore,targets=new Map();
  const key=type=>type||'all';
  const filename=type=>'桌边-'+(C.names[type]||'全部存档')+'.json';
  const supported=()=>typeof window.showSaveFilePicker==='function';
  const dbReady=new Promise(resolve=>{
    if(!window.indexedDB){resolve(null);return}
    try{
      const request=window.indexedDB.open('tablecorner-save-files',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('targets');
      request.onsuccess=()=>resolve(request.result);request.onerror=request.onblocked=()=>resolve(null);
    }catch(e){resolve(null)}
  });
  const ready=dbReady.then(db=>new Promise(resolve=>{
    if(!db){resolve();return}
    try{
      const store=db.transaction('targets').objectStore('targets'),request=store.openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return}const handle=cursor.value;if(['all',...Object.keys(C.names)].includes(cursor.key)&&handle&&handle.kind==='file')targets.set(cursor.key,handle);cursor.continue()};
      request.onerror=()=>resolve();
    }catch(e){resolve()}
  }));
  async function remember(type,handle){
    targets.set(key(type),handle);const db=await dbReady;if(!db)return;
    await new Promise(resolve=>{try{const tx=db.transaction('targets','readwrite');tx.objectStore('targets').put(handle,key(type));tx.oncomplete=tx.onerror=tx.onabort=()=>resolve()}catch(e){resolve()}});
  }
  function targetName(type){const handle=targets.get(key(type));return handle?handle.name:''}
  async function write(type,data,asNew=false){
    if(!supported())throw Error('此浏览器不支持覆盖文件，请使用下载副本，或用 Chrome / Edge 打开');
    let handle=asNew?null:targets.get(key(type));
    if(!handle)handle=await window.showSaveFilePicker({id:'tablecorner-'+key(type),suggestedName:filename(type),types:[{description:'桌边 JSON 存档',accept:{'application/json':['.json']}}]});
    else if(await handle.queryPermission({mode:'readwrite'})!=='granted'&&await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('未获得此文件的写入权限，可重新选择文件或下载副本');
    let writer;
    try{writer=await handle.createWritable();await writer.write(data);await writer.close()}
    catch(e){if(writer&&writer.abort)try{await writer.abort()}catch(ignore){}throw e}
    await remember(type,handle);return handle.name;
  }
  C.SaveFiles={ready,supported,targetName,write,filename,remember};
})();
