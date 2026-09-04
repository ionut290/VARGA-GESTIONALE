// Ricompone le immagini fisse del modello Avola e le applica al PDF.
(function(){
  const map={
    'assets/avola-preventivo-sidebar.png':'data:image/webp;base64,'+(window.AVOLA_SIDEBAR_B64||''),
    'assets/avola-firma.png':'data:image/webp;base64,'+(window.AVOLA_SIGNATURE_B64||'')
  };
  function fixImg(img){
    const raw=img.getAttribute&&img.getAttribute('src');
    if(raw&&map[raw]&&img.src!==map[raw]) img.src=map[raw];
  }
  function fix(root){
    if(root&&root.tagName==='IMG') fixImg(root);
    root?.querySelectorAll?.('img').forEach(fixImg);
  }
  const mo=new MutationObserver(list=>list.forEach(m=>{
    if(m.type==='attributes') fixImg(m.target);
    m.addedNodes.forEach(fix);
  }));
  mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  document.addEventListener('error',e=>{if(e.target?.tagName==='IMG')fixImg(e.target)},true);
  fix(document);
})();
