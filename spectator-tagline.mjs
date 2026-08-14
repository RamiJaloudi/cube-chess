const spectatorButton=document.querySelector('#allCpu');
if(spectatorButton){
  spectatorButton.innerHTML='<span class="spectator-main">Spectator Mode · All CPU</span><small class="spectator-sub">GPU Agents are Welcome</small>';
  spectatorButton.setAttribute('aria-label','Spectator Mode, all CPU. GPU Agents are Welcome.');
}
