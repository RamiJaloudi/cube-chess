const button=document.querySelector('#vrBtn');
let immersiveSupported=false;
let unavailableReason='This browser does not expose the WebXR device API.';

function addPreviewStyles(){
  const style=document.createElement('style');
  style.textContent=`
    .vr-preview .left-panel,.vr-preview .setup-panel,.vr-preview .bottom-bar{display:none!important}
    .vr-preview .topbar{opacity:.22}.vr-preview #reticle{width:18px;height:18px;margin:-9px;border-color:rgba(255,255,255,.8)}
    #vrNotice{position:fixed;z-index:50;left:50%;top:50%;transform:translate(-50%,-50%);width:min(480px,calc(100vw - 32px));padding:24px;border-radius:18px;background:rgba(8,10,17,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 25px 80px rgba(0,0,0,.6);color:#f5f5f2;font:14px/1.55 Segoe UI,system-ui,sans-serif}
    #vrNotice h2{margin:0 0 7px;font-size:21px}#vrNotice p{margin:7px 0;color:#b7bac7}#vrNotice strong{color:white}
    #vrNotice .vr-actions{display:flex;gap:8px;margin-top:18px}#vrNotice button{border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 12px;background:#28243c;color:white;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function showPreviewNotice(){
  document.querySelector('#vrNotice')?.remove();
  const notice=document.createElement('div');notice.id='vrNotice';
  notice.innerHTML=`<h2>VR preview mode</h2><p><strong>Immersive VR is unavailable in this browser.</strong> ${unavailableReason}</p><p>You can preview the headset-style unobstructed cube view here. For actual VR, open the deployed HTTPS build in Meta Quest Browser, or use a desktop browser with WebXR and an active OpenXR headset runtime.</p><div class="vr-actions"><button id="startPreview">Start fullscreen preview</button><button id="dismissVr">Close</button></div>`;
  document.body.appendChild(notice);
  notice.querySelector('#dismissVr').addEventListener('click',()=>notice.remove());
  notice.querySelector('#startPreview').addEventListener('click',async()=>{notice.remove();document.documentElement.classList.add('vr-preview');try{await document.documentElement.requestFullscreen?.();}catch{} });
}

addPreviewStyles();
if(button){
  button.textContent='Checking VR…';button.setAttribute('aria-busy','true');
  if(globalThis.isSecureContext&&navigator.xr){
    try{immersiveSupported=await navigator.xr.isSessionSupported('immersive-vr');if(!immersiveSupported)unavailableReason='No compatible headset and OpenXR runtime were detected.';}catch(error){unavailableReason='The browser could not query the headset runtime.';}
  } else if(!globalThis.isSecureContext){unavailableReason='WebXR requires HTTPS or localhost.';}
  button.removeAttribute('aria-busy');button.textContent=immersiveSupported?'Enter VR':'VR preview';
  button.title=immersiveSupported?'Start an immersive WebXR session':unavailableReason;
  if(!immersiveSupported){
    // Capture before app.mjs's target listener so unsupported browsers receive a useful fallback.
    document.addEventListener('click',event=>{if(event.target.closest?.('#vrBtn')){event.preventDefault();event.stopImmediatePropagation();showPreviewNotice();}},true);
  }
}

document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.documentElement.classList.remove('vr-preview');});
