const params=new URLSearchParams(location.search);
const palette=params.get('palette');
const classic=params.get('mode')==='classic';
const tabs=document.querySelector('#formatTabs');

tabs?.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.id==='standardMode'&&!classic){
    event.preventDefault();event.stopImmediatePropagation();
    const url=new URL(location.href);url.search='';url.searchParams.set('mode','classic');if(palette)url.searchParams.set('palette',palette);location.assign(url);return;
  }
  if(classic&&button.dataset.format){
    event.preventDefault();event.stopImmediatePropagation();
    const url=new URL(location.href);url.search='';url.searchParams.set('format',button.dataset.format);if(palette)url.searchParams.set('palette',palette);location.assign(url);
  }
},true);
