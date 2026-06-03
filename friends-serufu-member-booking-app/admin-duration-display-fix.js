(()=>{
  const USE_MINUTES=40;
  const pad=n=>String(n).padStart(2,'0');
  const fmt=m=>{m=Number(m);return m===1440?'24:00':pad(Math.floor(m/60))+':'+pad(m%60)};
  const toMin=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m};
  const fixedRange=text=>String(text).replace(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2}|24:00)/g,(all,start)=>`${start}〜${fmt(toMin(start)+USE_MINUTES)}`);
  function fixTextNode(node){
    const next=fixedRange(node.nodeValue);
    if(next!==node.nodeValue)node.nodeValue=next;
  }
  function walk(root){
    if(!root)return;
    const tree=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(tree.nextNode())nodes.push(tree.currentNode);
    nodes.forEach(fixTextNode);
    document.querySelectorAll('option').forEach(option=>{
      const next=fixedRange(option.textContent);
      if(next!==option.textContent)option.textContent=next;
    });
  }
  document.addEventListener('DOMContentLoaded',()=>walk(document.body));
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType===Node.TEXT_NODE)fixTextNode(node);
        if(node.nodeType===Node.ELEMENT_NODE)walk(node);
      });
      if(mutation.type==='characterData')fixTextNode(mutation.target);
    }
  });
  document.addEventListener('DOMContentLoaded',()=>observer.observe(document.body,{childList:true,subtree:true,characterData:true}));
})();