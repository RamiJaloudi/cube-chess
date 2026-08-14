if(new URLSearchParams(location.search).get('mode')==='classic'){
  const humanSide=document.querySelector('#humanSide');
  const allCpu=document.querySelector('#allCpu');
  const newGame=document.querySelector('#newGame');
  const seatList=document.querySelector('#seatList');
  const seatTitle=document.querySelector('.seat-title');
  const selectionInfo=document.querySelector('#selectionInfo');
  const storageKey='cube-chess-standard-controllers';
  let applying=false;
  let desired=['human','cpu'];

  try{
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(Array.isArray(saved)&&saved.length===2&&saved.every(value=>value==='human'||value==='cpu'))desired=saved;
  }catch{}

  const seats=()=>[...seatList.querySelectorAll('[data-army]')];
  const persist=()=>sessionStorage.setItem(storageKey,JSON.stringify(desired));
  const decorate=()=>seats().forEach((button,index)=>{
    const side=index===0?'White':'Black',controller=button.textContent.trim();
    button.title=`${side} controller: ${controller}. Click to switch Human or CPU.`;
    button.setAttribute('aria-label',button.title);
  });
  const captureDesired=()=>{
    if(applying)return;
    const current=seats();
    if(current.length!==2)return;
    desired=current.map(button=>button.textContent.trim().toLowerCase()==='cpu'?'cpu':'human');
    persist();decorate();
  };
  const applyDesired=()=>{
    const current=seats();if(current.length!==2)return;
    applying=true;
    current.forEach((button,index)=>{
      const actual=button.textContent.trim().toLowerCase()==='cpu'?'cpu':'human';
      if(actual!==desired[index])button.click();
    });
    applying=false;decorate();
  };

  if(seatTitle)seatTitle.textContent='WHITE & BLACK CONTROLLERS | CLICK TO CHANGE';
  if(allCpu){
    allCpu.innerHTML='<span class="spectator-main">CPU vs CPU &middot; Spectator</span><small class="spectator-sub">GPU Agents are Welcome</small>';
    allCpu.setAttribute('aria-label','Set both White and Black to CPU spectator mode.');
    allCpu.addEventListener('click',()=>{desired=['cpu','cpu'];persist();queueMicrotask(applyDesired)},true);
  }
  humanSide?.addEventListener('click',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    desired=['human','cpu'];persist();applyDesired();
  },true);
  seatList?.addEventListener('click',()=>queueMicrotask(captureDesired),true);
  newGame?.addEventListener('click',()=>queueMicrotask(applyDesired),true);

  const clarifyFooter=()=>{
    if(!selectionInfo||!selectionInfo.querySelector('strong')?.textContent.startsWith('Select'))return;
    const detail=selectionInfo.querySelector('span');
    if(detail&&detail.textContent!=='Standard chess | Floor board only')detail.textContent='Standard chess | Floor board only';
  };
  if(seatList)new MutationObserver(()=>{decorate()}).observe(seatList,{childList:true,subtree:true});
  if(selectionInfo)new MutationObserver(clarifyFooter).observe(selectionInfo,{childList:true,subtree:true});
  setTimeout(()=>{applyDesired();clarifyFooter()},0);
}
