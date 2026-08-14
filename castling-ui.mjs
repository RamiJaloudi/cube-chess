const legend=document.querySelector('.bottom-bar .legend');
if(legend){
  const item=document.createElement('span');
  item.className='castle-legend';
  item.title='Select an unmoved king, then choose the two-square destination. The path must be clear and safe.';
  item.innerHTML='<i class="dot castle"></i>Castle: king → 2';
  legend.appendChild(item);
}
