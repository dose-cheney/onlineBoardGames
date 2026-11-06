(async function () {
  'use strict';
  const entry = new URL('.', location.href);
  if (location.protocol === 'file:') { location.replace(new URL('app.html', entry)); return; }
  const status = document.getElementById('version-status');
  try {
    const response = await fetch(new URL('versions.json?update='+Date.now(), entry), { cache:'no-store' });
    if (!response.ok) throw Error('暂时无法读取版本列表，请刷新重试。');
    const manifest = await response.json(), requested = new URL(location.href).searchParams.get('v');
    const version = requested ? requested.replace(/^v/, '') : manifest.latest;
    const record = Object.hasOwn(manifest.versions, version) && manifest.versions[version];
    if (!record) {
      status.replaceChildren();
      const title=document.createElement('h1');title.textContent='没有找到这个版本';status.append(title);
      const text=document.createElement('p');text.textContent='可用版本：'+Object.keys(manifest.versions).join('、');status.append(text);
      const link=document.createElement('a');link.href=entry.href;link.textContent='打开最新版';status.append(link);return;
    }
    const directory = new URL('versions/v'+version+'/', entry);
    const page = await fetch(new URL('index.html?build='+encodeURIComponent(record.build), directory), { cache:'no-store' });
    if (!page.ok) throw Error('暂时无法打开这个版本，请刷新重试。');
    const parsed = new DOMParser().parseFromString(await page.text(), 'text/html');
    const scripts = [...parsed.querySelectorAll('script[src]')].map(script => new URL(script.getAttribute('src'), directory).href);
    parsed.querySelectorAll('script').forEach(script=>script.remove());
    for (const link of parsed.querySelectorAll('link[href]')) link.href=new URL(link.getAttribute('href'), directory).href;
    parsed.querySelectorAll('base').forEach(base=>base.remove());
    const base=document.createElement('base');base.href=directory.href;parsed.head.prepend(base);
    document.head.replaceChildren(...parsed.head.childNodes);
    for (const attr of [...document.body.attributes]) document.body.removeAttribute(attr.name);
    for (const attr of parsed.body.attributes) document.body.setAttribute(attr.name, attr.value);
    document.body.replaceChildren(...parsed.body.childNodes);
    document.documentElement.dataset.gameVersion=version;
    for (const src of scripts) await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.async=false;
      script.onload=resolve;script.onerror=()=>reject(Error('游戏资源加载失败，请刷新重试。'));document.head.append(script);
    });
  } catch (error) {
    const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;
    document.body.append(message);
  }
})();
